// The chat panel's session: one provider, one model, one conversation held in
// memory, shared by the launcher and the panel. The AI SDK and the MCP client
// are only imported once a message is actually sent.
import { computed, ref, watch } from 'vue'
import type { ModelMessage, ToolSet } from 'ai'
import { createSession, providerModelId, type AssistantModel, type AssistantProvider } from '@/lib/api'
import {
  apiBaseUrl,
  authToken,
  readStored,
  realmInfo,
  sessionEpoch,
  storeValue,
  userInfo,
} from './aruna/state'
import { loadRoCrate } from './aruna/crates'
import { useAssistantProviders } from './useAssistantProviders'
import { useAssistantEditor } from './useAssistantEditor'
import { useAssistantRunForm } from './useAssistantRunForm'
import type { McpConnection } from '@/lib/assistant/mcpClient'
import type { PromptContext } from '@/lib/assistant/prompt'
import type { ArtifactRef, LoadedArtifact } from '@/lib/assistant/renderTools'
import { ARTIFACT_TEXT_CAP } from '@/lib/assistant/types'
import type { ApprovalGate, ApprovalRequest, ChatMessage, ToolCallView } from '@/lib/assistant/types'
import { clampEffort, modelSuggestions, reasoningEffortOptions } from '@/lib/assistant/modelOptions'
import type { StreamProviderOptions } from '@/lib/assistant/chat'
import {
  assistantChatScopeKey,
  createAssistantChatStore,
  newAssistantChat,
  type AssistantChatRecord,
  type AssistantChatScope,
  type AssistantChatState,
} from '@/lib/assistant/chatHistory'
import { watchPoller } from '@/lib/assistant/watchPoll'
import {
  createWatchRegistry,
  createWatchStore,
  type WatchKind,
  type WatchRegistry,
  type WatchResult,
} from '@/lib/assistant/watchers'
import { until } from '@vueuse/core'
import { errorMessage } from '@/lib/utils'
import { assistantAvailable as available, assistantOpen as open, assistantPageOpen, assistantUnread } from './assistantState'

const PROVIDER_KEY = 'aruna.assistant.provider'
const MODEL_KEY = 'aruna.assistant.model'
const APPROVE_KEY = 'aruna.assistant.approve'
const EFFORT_KEY = 'aruna.assistant.effort'
const SESSION_MARGIN_MS = 60_000
// What the chat says when the node serves no MCP endpoint.
const NO_MCP_NOTE = 'This node serves no MCP endpoint, so only the open editor can be used.'
// The same ceiling the object preview applies before bytes enter the tab.
const ARTIFACT_CAP = 25 * 1024 * 1024
const MAX_ARTIFACT_URLS = 24
// One heartbeat drives both the watchers and the queued resumes; each watcher
// keeps its own backoff, so this only decides how soon a due one is noticed.
const WATCH_TICK_MS = 5_000
// Told to the model after a background update; the transcript shows the update alone.
const RESUME_NOTE = 'Answer this update in this chat: read the current state with the tools, show it with a '
  + 'card, and carry on with whatever was waiting on it. If the portal stopped watching before the work '
  + 'settled, say so and offer to check again.'

// Any string level the active model advertises; validated against its list.
export type ReasoningEffort = string

function readEffort(): string {
  return readStored(EFFORT_KEY) || 'medium'
}

// Off/Low/Medium/High map to a thinking-token budget for providers without
// native effort tiers.
const THINK_BUDGET: Record<string, number> = { low: 2000, medium: 6000, high: 12000 }

export interface TurnRequest {
  providerOptions?: StreamProviderOptions
  maxOutputTokens?: number
}

// How one turn carries its reasoning effort: OpenAI responses and chatgpt add
// store:false, openai chat sends it alone, anthropic maps it to a thinking
// budget under the output cap, openrouter keys it by the provider name.
export function turnRequest(kind: string, openAiResponses: boolean, effort: string): TurnRequest {
  if (openAiResponses) return { providerOptions: { openai: { store: false, reasoningEffort: effort } } }
  if (kind === 'openai') return { providerOptions: { openai: { reasoningEffort: effort } } }
  if (kind === 'anthropic') {
    if (effort === 'off') return {}
    const budget = THINK_BUDGET[effort] ?? THINK_BUDGET.medium
    return {
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: budget } } },
      maxOutputTokens: budget + 8000,
    }
  }
  if (kind === 'openrouter' || kind === 'openai_compatible') {
    if (effort === 'off') return {}
    return { providerOptions: { [kind]: { reasoning: { effort } } } }
  }
  return {}
}

export interface PendingApproval {
  request: ApprovalRequest
  /** True for a draft delete, which asks whatever the toggle says. */
  always: boolean
  decide: (approved: boolean) => void
}

const busy = ref(false)
// One message box shared by the page and the panel, so a suggestion chip and
// a half-typed question survive the move between them.
const draft = ref('')
const messages = ref<ChatMessage[]>([])
const error = ref<string | null>(null)
const toolsNote = ref<string | null>(null)
const pending = ref<PendingApproval | null>(null)
const chats = ref<AssistantChatRecord[]>([])
const activeChatId = ref('')
const historyReady = ref(false)
// Background updates that landed in a chat the user has not opened since.
const unreadChats = ref<Record<string, number>>({})
const providerId = ref(readStored(PROVIDER_KEY))
const modelId = ref(readStored(MODEL_KEY))
const approveWrites = ref(readStored(APPROVE_KEY) !== 'off')
const storedEffort = ref<string>(readEffort())

let history: ModelMessage[] = []
let chatState: AssistantChatState = { activeChatId: '', chats: [] }
let chatStore: ReturnType<typeof createAssistantChatStore> | null = null
let chatScopeKey = ''
let counter = 0
let session: { token: string; expiresAt: number; epoch: number } | null = null
let sessionInFlight: { epoch: number; owner: TurnContext | null; promise: Promise<string> } | null = null
let connection: McpConnection | null = null
let connectionToken = ''
let connectionUrl = ''
let watchStore: ReturnType<typeof createWatchStore> | null = null
let watchRegistry: WatchRegistry | null = null
let watchTimer: ReturnType<typeof setInterval> | null = null
// Updates waiting for the turn slot; a resume never races the running turn.
const resumeQueue: Array<{ chatId: string; text: string }> = []
let lastContext: PromptContext | null = null

interface TurnContext {
  generation: number
  chatId: string
  /** The model id this turn runs on, recorded on any run it submits. */
  model: string
  userMessageId: string
  messageId: string
  controller: AbortController
  /** Set on a watcher resume: the text to re-queue if the turn is cut short. */
  resumeText?: string
}

interface ApprovalEntry {
  request: ApprovalRequest
  always: boolean
  turn: TurnContext
  resolve: (approved: boolean) => void
  settled: boolean
}

let turnGeneration = 0
let activeTurn: TurnContext | null = null
let activeApproval: ApprovalEntry | null = null
const approvalQueue: ApprovalEntry[] = []
let assistantEpoch = sessionEpoch.value

// Blob URLs the artifact cards draw from. They outlive a chat switch because
// the cards do; the oldest goes once the list outgrows the cap, and clearing
// the conversations frees them all.
const artifactUrls: string[] = []

function trackArtifact(url: string) {
  artifactUrls.push(url)
  while (artifactUrls.length > MAX_ARTIFACT_URLS) {
    const stale = artifactUrls.shift()
    if (stale) URL.revokeObjectURL(stale)
  }
}

function releaseArtifacts() {
  for (const url of artifactUrls.splice(0)) URL.revokeObjectURL(url)
}

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function nextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `m-${crypto.randomUUID()}`
  counter += 1
  return `m-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function currentChatScope(): AssistantChatScope | null {
  const token = authToken.value.trim()
  const userId = userInfo.value?.user.user_id ?? ''
  const realmId = userInfo.value?.realm.realm_id ?? realmInfo.value?.realm_id ?? ''
  if (!token || !userId || !realmId || !apiBaseUrl.value) return null
  return { apiBaseUrl: apiBaseUrl.value, realmId, userId }
}

function updateChatList() {
  chats.value = [...chatState.chats]
}

function activeChat(): AssistantChatRecord | null {
  return chatState.chats.find((chat) => chat.id === activeChatId.value) ?? null
}

// A persist replaces every chat record, so a turn holds a chat id and looks the
// record up again. The panel's refs stay the live view of the active chat, and
// a write lands in both, so the two never drift apart.
function chatById(id: string): AssistantChatRecord | null {
  return chatState.chats.find((chat) => chat.id === id) ?? null
}

function isActiveChat(chatId: string): boolean {
  return chatId === activeChatId.value
}

function messagesOf(chatId: string): ChatMessage[] {
  return isActiveChat(chatId) ? messages.value : chatById(chatId)?.messages ?? []
}

function setMessagesOf(chatId: string, next: ChatMessage[]) {
  const chat = chatById(chatId)
  if (chat) chat.messages = next
  if (isActiveChat(chatId)) messages.value = next
}

function historyOf(chatId: string): ModelMessage[] {
  return isActiveChat(chatId) ? history : chatById(chatId)?.history ?? []
}

function setHistoryOf(chatId: string, next: ModelMessage[]) {
  const chat = chatById(chatId)
  if (chat) chat.history = next
  if (isActiveChat(chatId)) history = next
}

function applyChatState(next: AssistantChatState) {
  chatState = next
  activeChatId.value = next.activeChatId
  const current = activeChat()
  error.value = null
  toolsNote.value = null
  messages.value = current?.messages ?? []
  history = current?.history ?? []
  updateChatList()
}

function clearChatState() {
  releaseArtifacts()
  chatState = { activeChatId: '', chats: [] }
  activeChatId.value = ''
  chats.value = []
  history = []
  messages.value = []
  error.value = null
  toolsNote.value = null
}

function persistChatState() {
  if (!chatStore || !chatScopeKey) return
  chatState = chatStore.save(chatState)
  activeChatId.value = chatState.activeChatId
  updateChatList()
}

function persistCurrentChat() {
  const current = activeChat()
  if (!chatStore || !current || !chatScopeKey) return
  current.messages = messages.value
  current.history = history
  current.updatedAt = Date.now()
  persistChatState()
}

function persistChat(chatId: string) {
  if (!chatStore || !chatScopeKey) return
  if (isActiveChat(chatId)) {
    persistCurrentChat()
    return
  }
  const chat = chatById(chatId)
  if (!chat) return
  chat.updatedAt = Date.now()
  persistChatState()
}

function chatTitle(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  return compact.slice(0, 80) || 'New chat'
}

function startFreshChat() {
  if (!chatStore || !historyReady.value) {
    resetConversation()
    return
  }
  const current = activeChat()
  if (current && !current.messages.length && !current.history.length) {
    resetConversation()
    persistCurrentChat()
    return
  }
  const chat = newAssistantChat()
  chatState = { activeChatId: chat.id, chats: [chat, ...chatState.chats] }
  applyChatState(chatState)
  persistCurrentChat()
}

function isCurrentTurn(turn: TurnContext): boolean {
  return activeTurn === turn && turn.generation === turnGeneration && !turn.controller.signal.aborted
}

/** True while the turn's own chat is the one on screen; panel state follows it. */
function isShownTurn(turn: TurnContext): boolean {
  return isCurrentTurn(turn) && isActiveChat(turn.chatId)
}

function abortError(): DOMException {
  return new DOMException('The assistant session changed.', 'AbortError')
}

function patchCall(chatId: string, messageId: string, id: string, patch: Partial<ToolCallView>) {
  const message = messagesOf(chatId).find((entry) => entry.id === messageId)
  if (!message) return
  message.calls = message.calls.map((call) => (call.id === id ? { ...call, ...patch } : call))
}

function settleApproval(entry: ApprovalEntry, approved: boolean) {
  if (entry.settled) return
  entry.settled = true
  if (activeApproval === entry) {
    activeApproval = null
    pending.value = null
  }
  patchCall(entry.turn.chatId, entry.turn.messageId, entry.request.id, { state: approved ? 'running' : 'denied' })
  entry.resolve(approved)
}

function pumpApprovals() {
  if (activeApproval || !approvalQueue.length) return
  const entry = approvalQueue.shift()!
  if (entry.settled) {
    pumpApprovals()
    return
  }
  if (!isCurrentTurn(entry.turn)) {
    settleApproval(entry, false)
    pumpApprovals()
    return
  }
  activeApproval = entry
  patchCall(entry.turn.chatId, entry.turn.messageId, entry.request.id, { state: 'approval' })
  pending.value = {
    request: entry.request,
    always: entry.always,
    decide: (approved) => {
      if (activeApproval !== entry) return
      settleApproval(entry, approved)
      pumpApprovals()
    },
  }
}

function drainApprovals() {
  const active = activeApproval
  activeApproval = null
  pending.value = null
  if (active) settleApproval(active, false)
  for (const entry of approvalQueue.splice(0)) settleApproval(entry, false)
}

function approvalGate(turn: TurnContext): ApprovalGate {
  return {
    enabled: () => approveWrites.value,
    ask: (request, always) => new Promise<boolean>((resolve) => {
      const entry: ApprovalEntry = { request, always, turn, resolve, settled: false }
      // Nobody is there to answer a watcher's turn, so it never asks.
      if (!isCurrentTurn(turn) || turn.resumeText !== undefined) {
        settleApproval(entry, false)
        return
      }
      approvalQueue.push(entry)
      pumpApprovals()
    }),
  }
}

/** The child session the MCP client authenticates with; re-minted on expiry. */
async function sessionToken(signal?: AbortSignal, turn?: TurnContext): Promise<string> {
  syncEpoch()
  if (turn && !isCurrentTurn(turn)) throw abortError()
  const epoch = sessionEpoch.value
  if (session && session.epoch === epoch && session.expiresAt - Date.now() > SESSION_MARGIN_MS) return session.token
  if (!sessionInFlight || sessionInFlight.epoch !== epoch) {
    const owner = turn ?? null
    const promise = createSession({ kind: 'assistant', label: 'Portal chat' }, client(), signal).then((minted) => {
      if (epoch !== sessionEpoch.value || (owner && !isCurrentTurn(owner))) throw abortError()
      session = { token: minted.token, expiresAt: new Date(minted.expires_at).getTime(), epoch }
      return minted.token
    })
    sessionInFlight = { epoch, owner, promise }
  }
  const pendingSession = sessionInFlight
  try {
    const token = await pendingSession.promise
    if (turn && !isCurrentTurn(turn)) throw abortError()
    return token
  } finally {
    if (sessionInFlight === pendingSession) sessionInFlight = null
  }
}

async function closeConnection(): Promise<void> {
  const old = connection
  connection = null
  connectionToken = ''
  connectionUrl = ''
  if (!old) return
  try {
    await old.close()
  } catch {
    // The connection is already detached; cleanup must not mask the reset.
  }
}

async function nodeToolSet(turn: TurnContext, gate: ApprovalGate): Promise<ToolSet> {
  const url = realmInfo.value?.interfaces.mcp?.url
  if (!url) {
    if (isShownTurn(turn)) toolsNote.value = NO_MCP_NOTE
    if (isCurrentTurn(turn)) await closeConnection()
    return {}
  }
  const token = await sessionToken(turn.controller.signal, turn)
  if (!isCurrentTurn(turn)) throw abortError()
  if (!connection || connectionToken !== token || connectionUrl !== url) {
    await closeConnection()
    const { connectMcp } = await import('@/lib/assistant/mcpClient')
    const next = await connectMcp(url, token)
    if (!isCurrentTurn(turn)) {
      try {
        await next.close()
      } catch {
        // Ignore cleanup of a connection opened for an aborted turn.
      }
      throw abortError()
    }
    connection = next
    connectionToken = token
    connectionUrl = url
  }
  const { nodeTools } = await import('@/lib/assistant/tools')
  const { withRunProvenance } = await import('@/lib/assistant/runProvenance')
  const source = connection
  if (!source) throw abortError()
  const descriptors = await source.listTools()
  if (!isCurrentTurn(turn)) throw abortError()
  const tagged = withRunProvenance(source, { model: turn.model, chatId: turn.chatId })
  return nodeTools(descriptors, tagged, gate)
}

/** The node serving the bucket: the given id, else the endpoint the output names. */
function artifactNode(
  resolve: (url: string) => { nodeId: string | null } | null,
  ref: ArtifactRef,
): string | null {
  if (ref.nodeId) return ref.nodeId
  if (!ref.endpointUrl) return null
  return resolve(`${ref.endpointUrl.replace(/\/+$/, '')}/${ref.bucket}/${ref.key}`)?.nodeId ?? null
}

const INLINE_KINDS = new Set(['image', 'text', 'markdown', 'table'])
const TEXT_KINDS = new Set(['text', 'markdown', 'table'])

/**
 * Fetches one stored object for an artifact card: a blob URL for bytes small
 * enough to hold in the tab, a presigned link for everything else. The bytes
 * stay in the browser; only the content type and kind go back to the model.
 */
export async function loadArtifact(ref: ArtifactRef): Promise<LoadedArtifact> {
  const [{ useS3 }, { classifyObject, prettyJson }] = await Promise.all([
    import('./useS3'),
    import('./useObjectPreview'),
  ])
  const s3 = useS3()
  // The chat is open away from the data browser too, so this can be the first
  // S3 use of the visit.
  if (!s3.hasActiveKey.value) {
    const { activeGroupId } = await import('./useGroupSelection')
    if (activeGroupId.value) await s3.ensureSession(activeGroupId.value)
  }
  const nodeId = artifactNode(s3.resolveObjectUrl, ref)
  const name = ref.filename || ref.key.split('/').pop() || ref.key
  const contentType = ref.contentType || 'application/octet-stream'
  const classified = classifyObject({ key: name, contentType: ref.contentType })
  const oversize = typeof ref.size === 'number' && ref.size > ARTIFACT_CAP

  if (oversize || !INLINE_KINDS.has(classified.kind)) {
    const url = await s3.downloadUrl(ref.bucket, ref.key, nodeId, ref.versionId)
    return { url, contentType, kind: oversize ? 'download' : classified.kind, name, size: ref.size }
  }

  const blob = await s3.getObjectBlob(ref.bucket, ref.key, nodeId, ref.versionId)
  if (blob.size > ARTIFACT_CAP) {
    const url = await s3.downloadUrl(ref.bucket, ref.key, nodeId, ref.versionId)
    return { url, contentType, kind: 'download', name, size: blob.size }
  }
  const url = URL.createObjectURL(blob)
  trackArtifact(url)
  // The card reads the text from here: a blob URL cannot be fetched back under
  // the node's connect-src policy, and the bytes are already in the tab. JSON is
  // formatted first and capped after, the way the file dialog shows it.
  const raw = TEXT_KINDS.has(classified.kind) ? await blob.text() : undefined
  const body = raw === undefined
    ? undefined
    : (classified.language === 'json' ? prettyJson(raw) : raw).slice(0, ARTIFACT_TEXT_CAP)
  return {
    url,
    contentType: ref.contentType || blob.type || contentType,
    kind: classified.kind,
    name,
    size: blob.size,
    text: body,
  }
}

// The cards a render tool asks for stay on the call; the model only hears "shown".
async function renderToolSet(turn: TurnContext): Promise<ToolSet> {
  const { renderTools } = await import('@/lib/assistant/renderTools')
  return renderTools({
    keep: (id, view) => {
      if (isCurrentTurn(turn)) patchCall(turn.chatId, turn.messageId, id, { view })
    },
    loadCrate: loadRoCrate,
    loadArtifact,
  })
}

async function toolSet(turn: TurnContext): Promise<ToolSet> {
  const { bridge } = useAssistantEditor()
  const { bridge: runForm } = useAssistantRunForm()
  const { editorTools } = await import('@/lib/assistant/editorTools')
  const { runFormTools } = await import('@/lib/assistant/runFormTools')
  const { watchTools } = await import('@/lib/assistant/watchTools')
  const { mergeTools } = await import('@/lib/assistant/tools')
  const gate = approvalGate(turn)
  const local = mergeTools(
    await renderToolSet(turn),
    watchTools({ watch: (input) => addWatch(turn.chatId, input) }),
    bridge.value ? editorTools(bridge.value, gate) : {},
    runForm.value ? runFormTools(runForm.value, gate) : {},
  )
  try {
    const remote = await nodeToolSet(turn, gate)
    if (isShownTurn(turn) && realmInfo.value?.interfaces.mcp?.url) toolsNote.value = null
    return mergeTools(remote, local)
  } catch (cause) {
    if (isShownTurn(turn)) toolsNote.value = `The node tools are unavailable: ${errorMessage(cause)}`
    if (isCurrentTurn(turn)) await closeConnection()
    return local
  }
}

function abortTurn(): TurnContext | null {
  const turn = activeTurn
  turnGeneration += 1
  activeTurn = null
  turn?.controller.abort()
  if (turn && sessionInFlight?.owner === turn) sessionInFlight = null
  drainApprovals()
  if (turn) busy.value = false
  // A watcher's update outlives the turn that was answering it.
  if (turn?.resumeText !== undefined) {
    resumeQueue.unshift({ chatId: turn.chatId, text: turn.resumeText })
    armWatchTimer()
  }
  return turn
}

/** Aborts the turn on screen; a watcher's turn keeps running in its own chat. */
function abortShownTurn() {
  if (activeTurn && activeTurn.resumeText === undefined) discardTurn(abortTurn())
}

function discardTurn(turn: TurnContext | null) {
  if (!turn) return
  setMessagesOf(turn.chatId, messagesOf(turn.chatId).filter((message) =>
    message.id !== turn.userMessageId && message.id !== turn.messageId))
}

// ── Background watchers ────────────────────────────────────────────────────

function saveWatchState() {
  watchStore?.save({ watches: watchRegistry?.list() ?? [], unread: unreadChats.value })
}

function applyUnread(next: Record<string, number>) {
  unreadChats.value = next
  assistantUnread.value = Object.values(next).reduce((total, value) => total + value, 0)
}

function markUnread(chatId: string) {
  if (isActiveChat(chatId) && (open.value || assistantPageOpen.value)) return
  applyUnread({ ...unreadChats.value, [chatId]: Math.min(99, (unreadChats.value[chatId] ?? 0) + 1) })
  saveWatchState()
}

function markChatRead(chatId: string) {
  if (!unreadChats.value[chatId]) return
  const next = { ...unreadChats.value }
  delete next[chatId]
  applyUnread(next)
  saveWatchState()
}

function stopWatchTimer() {
  if (watchTimer === null) return
  clearInterval(watchTimer)
  watchTimer = null
}

async function tickWatches() {
  const registry = watchRegistry
  if (!registry) {
    stopWatchTimer()
    return
  }
  await registry.tick()
  pumpResumes()
  if (!registry.list().length && !resumeQueue.length) stopWatchTimer()
}

function armWatchTimer() {
  if (watchTimer !== null || typeof setInterval !== 'function') return
  if (!watchRegistry?.list().length && !resumeQueue.length) return
  watchTimer = setInterval(() => void tickWatches(), WATCH_TICK_MS)
}

function addWatch(chatId: string, input: { kind: WatchKind; target: string; label: string }): WatchResult {
  if (!watchRegistry) return { ok: false, message: 'The portal cannot watch background work right now.' }
  const result = watchRegistry.add({ chatId, ...input })
  armWatchTimer()
  return result
}

function startWatchers(scope: AssistantChatScope) {
  const store = createWatchStore(scope)
  const payload = store.load()
  watchStore = store
  applyUnread(payload.unread)
  watchRegistry = createWatchRegistry({
    poll: watchPoller(client),
    resume: resumeChat,
    hasChat: (chatId) => chatState.chats.some((chat) => chat.id === chatId),
    load: () => payload.watches,
    save: () => saveWatchState(),
  })
  armWatchTimer()
}

function stopWatchers() {
  stopWatchTimer()
  watchRegistry = null
  watchStore = null
  resumeQueue.length = 0
  applyUnread({})
}

/** A watcher's update, appended to its chat so the assistant answers it there. */
function resumeChat(chatId: string, text: string) {
  if (!chatById(chatId)) return
  resumeQueue.push({ chatId, text })
  armWatchTimer()
  pumpResumes()
}

// The page the update arrives on is not the page the chat was opened from, so
// only the durable part of the last context is carried over.
function resumeContext(): PromptContext {
  return { route: lastContext?.route ?? '/', identity: lastContext?.identity ?? null }
}

function pumpResumes() {
  if (busy.value || activeTurn || !resumeQueue.length) return
  const next = resumeQueue.shift()
  if (!next) return
  if (!chatById(next.chatId)) {
    pumpResumes()
    return
  }
  markUnread(next.chatId)
  if (!provider.value || !model.value || !chatStore || !historyReady.value) {
    // No model can answer right now, so the update waits in the transcript.
    setMessagesOf(next.chatId, [
      ...messagesOf(next.chatId),
      { id: nextId(), role: 'user', text: next.text, calls: [], at: Date.now(), background: true },
    ])
    persistChat(next.chatId)
    return
  }
  void runChatTurn(next.chatId, next.text, resumeContext(), next.text)
}

// One turn against one chat, not always the one on screen: a watcher resumes
// its own chat. One turn runs at a time, so a resume waits for the slot, and
// `resumeText` marks a turn the person typing may set aside.
async function runChatTurn(chatId: string, prompt: string, context: PromptContext, resumeText?: string) {
  const selectedProvider = provider.value
  const modelName = model.value
  const chat = chatById(chatId)
  if (!chat || !selectedProvider || !modelName || !chatStore || !historyReady.value) return
  if (isActiveChat(chatId)) error.value = null
  // A watcher's turn holds the turn slot but leaves the composer usable; the
  // person typing takes the slot back through send().
  if (resumeText === undefined) busy.value = true
  const messageId = nextId()
  const assistantMessageId = nextId()
  const turn: TurnContext = {
    generation: ++turnGeneration,
    chatId,
    model: modelName,
    userMessageId: messageId,
    messageId: assistantMessageId,
    controller: new AbortController(),
    ...(resumeText === undefined ? {} : { resumeText }),
  }
  activeTurn = turn
  const startedAt = Date.now()
  setMessagesOf(chatId, [
    ...messagesOf(chatId),
    { id: messageId, role: 'user', text: prompt, calls: [], at: startedAt, ...(resumeText === undefined ? {} : { background: true as const }) },
    { id: assistantMessageId, role: 'assistant', text: '', calls: [], at: startedAt },
  ])
  if (resumeText === undefined && chat.title === 'New chat') chat.title = chatTitle(prompt)
  updateChatList()
  const turnMessages: ModelMessage[] = [
    ...historyOf(chatId),
    { role: 'user', content: resumeText === undefined ? prompt : `${prompt} ${RESUME_NOTE}` },
  ]
  const modelContext = { apiBaseUrl: apiBaseUrl.value, token: authToken.value }
  const answer = () => messagesOf(chatId).find((entry) => entry.id === assistantMessageId)
  try {
    const [{ runTurn }, { buildModel }, { buildBrowserModel }, { systemPrompt }] = await Promise.all([
      import('@/lib/assistant/chat'),
      import('@/lib/assistant/models'),
      import('@/lib/assistant/browserModels'),
      import('@/lib/assistant/prompt'),
    ])
    if (!isCurrentTurn(turn)) return
    const tools = await toolSet(turn)
    if (!isCurrentTurn(turn)) return
    const direct = providers.direct(selectedProvider.provider_id)
    const languageModel = direct
      ? buildBrowserModel({ ...direct, model: modelName })
      : buildModel(selectedProvider, modelName, modelContext)
    const openAiResponses = (direct?.kind === 'openai_compatible' && direct.protocol === 'responses')
      || selectedProvider.kind === 'chatgpt'
    // No offered effort means the model does not reason; sending one would fault.
    const req = effortOptions.value.length
      ? turnRequest(direct?.kind ?? selectedProvider.kind, openAiResponses, reasoningEffort.value)
      : {}
    const result = await runTurn({
      model: languageModel,
      system: systemPrompt(context),
      messages: turnMessages,
      tools,
      abortSignal: turn.controller.signal,
      providerOptions: req.providerOptions,
      maxOutputTokens: req.maxOutputTokens,
      onText: (delta) => {
        if (!isCurrentTurn(turn)) return
        const message = answer()
        if (message) message.text += delta
      },
      onToolCall: (call) => {
        if (!isCurrentTurn(turn)) return
        const message = answer()
        if (!message) return
        message.calls = [...message.calls, { ...call, state: 'running' }]
      },
      onToolResult: ({ id, output }) => {
        if (!isCurrentTurn(turn)) return
        const denied = answer()?.calls.find((call) => call.id === id)?.state === 'denied'
        if (denied) patchCall(chatId, assistantMessageId, id, { output })
        else patchCall(chatId, assistantMessageId, id, { state: 'done', output })
      },
      onToolError: ({ id, message: toolError }) => {
        if (isCurrentTurn(turn)) patchCall(chatId, assistantMessageId, id, { state: 'error', error: toolError })
      },
    })
    if (!isCurrentTurn(turn)) return
    if (result.error && !turn.controller.signal.aborted) {
      if (isShownTurn(turn)) error.value = result.error
      const message = answer()
      if (message) message.error = result.error
    } else if (!result.error) {
      setHistoryOf(chatId, [...turnMessages, ...result.messages])
    }
  } catch (cause) {
    if (isCurrentTurn(turn) && !turn.controller.signal.aborted) {
      const failure = errorMessage(cause)
      if (isShownTurn(turn)) error.value = failure
      const message = answer()
      if (message) message.error = failure
    }
  } finally {
    if (activeTurn === turn) {
      activeTurn = null
      busy.value = false
      persistChat(chatId)
      pumpResumes()
    }
  }
}

function resetAssistantSession() {
  discardTurn(abortTurn())
  session = null
  sessionInFlight = null
  void closeConnection()
  watchRegistry?.clear()
  stopWatchTimer()
  resumeQueue.length = 0
  applyUnread({})
  saveWatchState()
  resetConversation()
  draft.value = ''
  providerId.value = ''
  modelId.value = ''
  storeValue(PROVIDER_KEY, '')
  storeValue(MODEL_KEY, '')
}

function resetConversation() {
  history = []
  messages.value = []
  error.value = null
  toolsNote.value = null
}

function syncChatScope() {
  const scope = currentChatScope()
  const nextKey = scope ? assistantChatScopeKey(scope) : ''
  if (nextKey === chatScopeKey && (Boolean(scope) === historyReady.value)) return

  // A changed realm, API base, or authenticated user must never leave the
  // previous transcript visible while the replacement scope is loading.
  if (chatScopeKey && nextKey !== chatScopeKey) discardTurn(abortTurn())
  chatScopeKey = ''
  chatStore = null
  historyReady.value = false
  stopWatchers()
  clearChatState()
  if (!scope) return

  const nextStore = createAssistantChatStore(scope)
  chatStore = nextStore
  chatScopeKey = nextStore.key
  historyReady.value = true
  applyChatState(nextStore.load())
  startWatchers(scope)
}

function syncEpoch() {
  if (assistantEpoch === sessionEpoch.value) return
  assistantEpoch = sessionEpoch.value
  resetAssistantSession()
}

watch(sessionEpoch, () => syncEpoch(), { flush: 'sync' })
watch(
  [apiBaseUrl, authToken, () => userInfo.value?.user.user_id ?? '', () => userInfo.value?.realm.realm_id ?? '', realmInfo],
  () => syncChatScope(),
  { flush: 'sync', immediate: true },
)

// The provider and model selection is module state, like the conversation, so
// a watcher's resume can run a turn without the panel being mounted.
const providers = useAssistantProviders()
const ready = computed(() => providers.ready.value)
const provider = computed<AssistantProvider | null>(() =>
  ready.value.find((entry) => entry.provider_id === providerId.value) ?? ready.value[0] ?? null)
const model = computed(() => (provider.value ? providerModelId(provider.value, modelId.value) : ''))
// What the provider offers now, ahead of the ids stored when it was added.
const modelChoices = computed(() => (provider.value
  ? modelSuggestions(provider.value, providers.listedModels.value[provider.value.provider_id] ?? [])
  : []))
const modelsError = computed(() =>
  (provider.value ? providers.modelErrors.value[provider.value.provider_id] ?? null : null))
// The active model object, whether it came from the fetched list or storage.
const selectedModel = computed<AssistantModel | null>(() => {
  const current = provider.value
  if (!current) return null
  const id = model.value
  const listed = providers.listedModels.value[current.provider_id] ?? []
  return listed.find((entry) => entry.id === id) ?? current.models.find((entry) => entry.id === id) ?? null
})
// The levels the active model offers, and the stored effort clamped to them.
const effortOptions = computed(() =>
  reasoningEffortOptions(provider.value?.kind ?? '', model.value, selectedModel.value?.reasoning_efforts))
const reasoningEffort = computed(() => clampEffort(storedEffort.value, effortOptions.value))

// Bucket names make a file name in an answer a link. Listing them needs an S3
// session, and the group is restored after mount, so this waits a while for
// one rather than reading it once and giving up.
export function ensureKnownBuckets(): void {
  void (async () => {
    const [{ useS3 }, { useBuckets }, { activeGroupId }] = await Promise.all([
      import('./useS3'),
      import('./useBuckets'),
      import('./useGroupSelection'),
    ])
    const groupId = await until(activeGroupId).toBeTruthy({ timeout: 30_000, throwOnTimeout: true })
    const s3 = useS3()
    if (!s3.hasActiveKey.value) await s3.ensureSession(groupId)
    await useBuckets().ensure()
  })().catch(() => {
    // A realm that refuses the listing simply leaves those names unlinked.
  })
}

export function useAssistantChat() {
  function loadModels() {
    if (provider.value) void providers.listModels(provider.value.provider_id)
  }

  function selectProvider(id: string) {
    syncEpoch()
    if (providerId.value === id) return
    discardTurn(abortTurn())
    persistCurrentChat()
    startFreshChat()
    providerId.value = id
    storeValue(PROVIDER_KEY, id)
    modelId.value = ''
    storeValue(MODEL_KEY, '')
  }

  // Any id goes: a fine-tune or a model newer than the fetched list.
  function selectModel(id: string) {
    syncEpoch()
    const next = id.trim()
    if (modelId.value === next) return
    discardTurn(abortTurn())
    persistCurrentChat()
    startFreshChat()
    modelId.value = next
    storeValue(MODEL_KEY, modelId.value)
  }

  function setApproveWrites(value: boolean) {
    approveWrites.value = value
    storeValue(APPROVE_KEY, value ? 'on' : 'off')
  }

  function setReasoningEffort(value: string) {
    if (!effortOptions.value.includes(value)) return
    storedEffort.value = value
    storeValue(EFFORT_KEY, value)
  }

  function newChat() {
    syncEpoch()
    discardTurn(abortTurn())
    persistCurrentChat()
    if (!chatStore || !historyReady.value) {
      resetConversation()
      return
    }
    startFreshChat()
  }

  function selectChat(id: string) {
    syncEpoch()
    if (!chatStore || !historyReady.value || !chatState.chats.some((chat) => chat.id === id)) return
    markChatRead(id)
    if (activeChatId.value === id) return
    abortShownTurn()
    persistCurrentChat()
    chatState = { ...chatState, activeChatId: id }
    applyChatState(chatState)
  }

  // Reopening the assistant lands on the conversation last written to.
  function selectLatestChat() {
    syncEpoch()
    if (busy.value || !chatStore || !historyReady.value) return
    let latest: AssistantChatRecord | null = null
    for (const chat of chatState.chats) if (!latest || chat.updatedAt > latest.updatedAt) latest = chat
    if (latest) selectChat(latest.id)
  }

  function deleteChat(id: string) {
    syncEpoch()
    if (!chatStore || !historyReady.value || !chatState.chats.some((chat) => chat.id === id)) return
    const wasActive = activeChatId.value === id
    if (activeTurn?.chatId === id) discardTurn(abortTurn())
    // A deleted chat has nothing left to resume, so its watchers go with it.
    watchRegistry?.dropChat(id)
    markChatRead(id)
    const remaining = chatState.chats.filter((chat) => chat.id !== id)
    const replacement = remaining[0] ?? newAssistantChat()
    chatState = {
      activeChatId: wasActive ? replacement.id : activeChatId.value,
      chats: remaining.length ? remaining : [replacement],
    }
    applyChatState(chatState)
    if (wasActive) persistCurrentChat()
    else persistChatState()
  }

  function renameChat(id: string, title: string) {
    syncEpoch()
    if (!chatStore || !historyReady.value) return
    const chat = chatState.chats.find((entry) => entry.id === id)
    if (!chat) return
    chat.title = title.trim().slice(0, 80) || 'New chat'
    chat.updatedAt = Date.now()
    chatState = chatStore.save(chatState)
    updateChatList()
  }

  function openPanel() {
    syncEpoch()
    open.value = true
    selectLatestChat()
    void providers.load()
    ensureKnownBuckets()
    if (realmInfo.value?.interfaces.mcp?.url) {
      void sessionToken().catch(() => {
        // A node that refuses the mint leaves the editor tools working.
      })
    }
  }

  // Seeds the composer, then opens the panel. The draft is set after openPanel
  // so an epoch reset inside it cannot wipe the seed; nothing is auto-sent.
  function openWith(prompt: string) {
    openPanel()
    draft.value = prompt.trim()
  }

  /** Shows the panel on the chat already active, for a page handing the conversation over. */
  function showPanel() {
    syncEpoch()
    open.value = true
  }

  function hidePanel() {
    open.value = false
  }

  function closePanel() {
    syncEpoch()
    open.value = false
    abortShownTurn()
    persistCurrentChat()
  }

  async function send(text: string, context: PromptContext) {
    const prompt = text.trim()
    syncEpoch()
    if (!prompt || !chatStore || !historyReady.value) return
    // A watcher's turn steps aside for the person typing; its update requeues.
    if (activeTurn?.resumeText !== undefined) discardTurn(abortTurn())
    else if (busy.value) return
    const current = activeChat()
    if (!current) return
    lastContext = context
    await runChatTurn(current.id, prompt, context)
  }

  return {
    open,
    busy,
    draft,
    messages,
    error,
    toolsNote,
    pending,
    chats,
    activeChatId,
    historyReady,
    unreadChats,
    provider,
    providers: ready,
    model,
    modelChoices,
    modelsError,
    loadModels,
    available,
    approveWrites,
    reasoningEffort,
    effortOptions,
    selectProvider,
    selectModel,
    setApproveWrites,
    setReasoningEffort,
    openPanel,
    showPanel,
    openWith,
    hidePanel,
    closePanel,
    newChat,
    selectChat,
    selectLatestChat,
    deleteChat,
    renameChat,
    send,
    ensureProviders: providers.ensureLoaded,
  }
}
