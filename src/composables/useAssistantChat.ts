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
import { useNotifications } from './useNotifications'
import { useAssistantEditor } from './useAssistantEditor'
import { useAssistantProfileForm } from './useAssistantProfileForm'
import { useAssistantRunForm } from './useAssistantRunForm'
import type { McpConnection } from '@/lib/assistant/mcpClient'
import type { PromptContext } from '@/lib/assistant/prompt'
import type { ArtifactRef, LoadedArtifact } from '@/lib/assistant/renderTools'
import { ARTIFACT_TEXT_CAP } from '@/lib/assistant/types'
import type { ApprovalGate, ApprovalRequest, ChatMessage, JobView, ToolCallView } from '@/lib/assistant/types'
import { clampEffort, modelSuggestions, reasoningEffortOptions } from '@/lib/assistant/modelOptions'
import type { StreamProviderOptions, TurnHandlers } from '@/lib/assistant/chat'
import {
  assistantChatScopeKey,
  createAssistantChatStore,
  newAssistantChat,
  type AssistantChatRecord,
  type AssistantChatScope,
  type AssistantChatState,
} from '@/lib/assistant/chatHistory'
import {
  ApiError,
  chatGone,
  deleteChat as deleteChatOnNode,
  listChats,
  putChat,
  putTurn,
  readTurns,
  type AssistantChatHead,
} from '@/lib/api'
import {
  decodeTurn,
  encodeTurn,
  joinTurns,
  mergeTurns,
  splitTurns,
  turnKey,
  type ChatTurn,
} from '@/lib/assistant/chatTurns'
import {
  cursorOf,
  markNew,
  markTurns,
  newChatSync,
  resetSync,
  restoreCursor,
  trackHead,
  turnSeqs,
  type ChatSync,
} from '@/lib/assistant/chatSync'
import { clearLiveJobs, setWatchedJobs } from '@/lib/assistant/jobLive'
import { refusedExtras, searchKind, type SearchKind } from '@/lib/assistant/webSearch'
import { WATCH_LOCK_NAME, watchLeadership, type WatchLeadership } from '@/lib/assistant/watchLock'
import { watchPoller } from '@/lib/assistant/watchPoll'
import {
  createWatchRegistry,
  createWatchStore,
  type AssistantWatch,
  type WatchKind,
  type WatchRegistry,
  type WatchResult,
} from '@/lib/assistant/watchers'
import { until } from '@vueuse/core'
import { errorMessage } from '@/lib/utils'
import {
  assistantAvailable as available,
  assistantOpen as open,
  assistantPageOpen,
  assistantRemovedProvider,
  assistantUnread,
  assistantWarning,
} from './assistantState'

const PROVIDER_KEY = 'aruna.assistant.provider'
const MODEL_KEY = 'aruna.assistant.model'
/** Saves to the node are batched, so a streaming answer writes once. */
export const REMOTE_SAVE_DELAY_MS = 3_000
const APPROVE_KEY = 'aruna.assistant.approve'
const SEARCH_KEY = 'aruna.assistant.search'
const EFFORT_KEY = 'aruna.assistant.effort'
const SESSION_MARGIN_MS = 60_000
// What the chat says when the node serves no MCP endpoint.
const NO_MCP_NOTE = 'This node serves no MCP endpoint, so only the open editor can be used.'
// Said once after a compatible endpoint refused an extra and the turn ran again without it.
const NO_SEARCH_NOTE = 'Web search is not available for this model.'
const NO_REASONING_NOTE = 'Reasoning options are not available for this model.'
// The same ceiling the object preview applies before bytes enter the tab.
const ARTIFACT_CAP = 25 * 1024 * 1024
const MAX_ARTIFACT_URLS = 24
// One heartbeat drives both the watchers and the queued resumes; each watcher
// keeps its own backoff, so this only decides how soon a due one is noticed.
const WATCH_TICK_MS = 5_000
/** A burst of change frames from the node makes one poll round. */
const REVISION_DEBOUNCE_MS = 300
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

export interface TurnSupport {
  /** The provider kind, as the record or the browser provider names it. */
  kind: string
  /** True when the model speaks the OpenAI Responses API. */
  responses: boolean
  /** The chosen effort, or null when the model lists no reasoning levels. */
  effort: string | null
  /** True when the turn carries the OpenAI web search tool. */
  search: boolean
}

// How one turn carries its extras: chatgpt always adds store:false, openai
// chat sends the effort alone, anthropic maps it to a thinking budget under
// the output cap, openrouter keys it by name. A compatible Responses endpoint
// gets store:false only beside the search or a reasoning field, and a chat
// completions one gets the effort under the name its adapter was made with.
export function turnRequest(support: TurnSupport): TurnRequest {
  const { kind, responses, effort, search } = support
  const reasoning = effort && effort !== 'off' ? effort : null
  if (kind === 'chatgpt') return { providerOptions: { openai: { store: false, ...(effort ? { reasoningEffort: effort } : {}) } } }
  if (kind === 'openai') return effort ? { providerOptions: { openai: { reasoningEffort: effort } } } : {}
  if (kind === 'anthropic') {
    if (!reasoning) return {}
    const budget = THINK_BUDGET[reasoning] ?? THINK_BUDGET.medium
    return {
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: budget } } },
      maxOutputTokens: budget + 8000,
    }
  }
  if (kind === 'openrouter') return reasoning ? { providerOptions: { openrouter: { reasoning: { effort: reasoning } } } } : {}
  if (kind === 'openai_compatible') {
    if (!responses) return reasoning ? { providerOptions: { 'openai-compatible': { reasoningEffort: reasoning } } } : {}
    if (!search && !reasoning) return {}
    return { providerOptions: { openai: { store: false, ...(reasoning ? { reasoningEffort: reasoning } : {}) } } }
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
const webSearch = ref(readStored(SEARCH_KEY) !== 'off')
const storedEffort = ref<string>(readEffort())

let history: ModelMessage[] = []
let chatState: AssistantChatState = { activeChatId: '', chats: [] }
let chatStore: ReturnType<typeof createAssistantChatStore> | null = null
let chatScopeKey = ''
// Set once the node answered for this scope; empty while chats stay in this browser.
let remoteScopeKey = ''
let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null
let remoteSaving = false
let pushPending = false
let counter = 0
let session: { token: string; expiresAt: number; epoch: number } | null = null
let sessionInFlight: { epoch: number; owner: TurnContext | null; promise: Promise<string> } | null = null
let connection: McpConnection | null = null
let connectionToken = ''
let connectionUrl = ''
let watchStore: ReturnType<typeof createWatchStore> | null = null
let watchRegistry: WatchRegistry | null = null
let watchTimer: ReturnType<typeof setInterval> | null = null
let revisionTimer: ReturnType<typeof setTimeout> | null = null
// Only the tab holding the lock polls; the others keep their timer and retry.
// The lock is scoped in startWatchers, so tabs on another node or user keep their own.
let watchLead: WatchLeadership = watchLeadership()
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
// The turn under way as the panel sees it: which chat, and which answer it writes.
const runningTurn = ref<{ chatId: string; messageId: string } | null>(null)
/** True while a turn writes into the chat on screen, the person's or a watcher's. */
const working = computed(() => runningTurn.value?.chatId === activeChatId.value)
const workingLabel = computed(() => {
  const answer = messages.value.find((message) => message.id === runningTurn.value?.messageId)
  const call = answer?.calls.filter((entry) => entry.state === 'running').at(-1)
  return call ? `Running ${call.name}` : 'Thinking'
})
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

/** Writes the chats to this browser; one the bounded store let go is only forgotten here. */
function saveChatState() {
  if (!chatStore) return
  const before = chatState.chats.map((chat) => chat.id)
  chatState = chatStore.save(chatState)
  // The node keeps a chat this browser has no room for; only deleteChat removes it there.
  for (const id of before) if (!chatById(id)) chatSyncs.delete(id)
  activeChatId.value = chatState.activeChatId
}

function persistChatState() {
  if (!chatStore || !chatScopeKey) return
  saveChatState()
  updateChatList()
  queueRemoteSave()
}

function persistCurrentChat() {
  const current = activeChat()
  if (!chatStore || !current || !chatScopeKey) return
  current.messages = messages.value
  current.history = history
  current.updatedAt = Date.now()
  persistChatState()
}

/** Saves a chat whose transcript grew, so its new turns reach the node. */
function persistChat(chatId: string) {
  const chat = chatById(chatId)
  if (!chatStore || !chatScopeKey || !chat) return
  if (isActiveChat(chatId)) {
    chat.messages = messages.value
    chat.history = history
  }
  chat.updatedAt = Date.now()
  markTurns(syncOf(chat.id), chatTurns(chat))
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

// One card per job: a later show_job updates the card already in the chat
// rather than adding a second one below it.
function updateJobCard(chatId: string, view: JobView): boolean {
  for (const message of messagesOf(chatId)) {
    const index = message.calls.findIndex((call) => call.view?.kind === 'job' && call.view.jobId === view.jobId)
    if (index < 0) continue
    const current = message.calls[index].view as JobView
    const merged: JobView = { ...current, ...view, outputs: view.outputs.length ? view.outputs : current.outputs }
    message.calls = message.calls.map((call, at) => (at === index ? { ...call, view: merged } : call))
    return true
  }
  return false
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

/**
 * Reads one stored HTML file as text, for the figures it carries inline. It is
 * read whole rather than capped like an artifact card's text, because a report
 * keeps its plots near the end; the markup never reaches the model.
 */
export async function loadHtml(ref: ArtifactRef): Promise<string> {
  const [{ useS3 }, { MAX_PREVIEW_HTML }] = await Promise.all([
    import('./useS3'),
    import('@/lib/htmlDocument'),
  ])
  const s3 = useS3()
  if (!s3.hasActiveKey.value) {
    const { activeGroupId } = await import('./useGroupSelection')
    if (activeGroupId.value) await s3.ensureSession(activeGroupId.value)
  }
  const nodeId = artifactNode(s3.resolveObjectUrl, ref)
  const blob = await s3.getObjectBlob(ref.bucket, ref.key, nodeId, ref.versionId)
  if (blob.size > ARTIFACT_CAP) throw new Error('That file is too large to read here.')
  return (await blob.text()).slice(0, MAX_PREVIEW_HTML)
}

// The cards a render tool asks for stay on the call; the model only hears "shown".
async function renderToolSet(turn: TurnContext): Promise<ToolSet> {
  const { renderTools } = await import('@/lib/assistant/renderTools')
  return renderTools({
    keep: (id, view) => {
      if (!isCurrentTurn(turn)) return false
      if (view.kind === 'job' && updateJobCard(turn.chatId, view)) return true
      patchCall(turn.chatId, turn.messageId, id, { view })
      return false
    },
    loadCrate: loadRoCrate,
    loadArtifact,
    loadHtml,
  })
}

async function toolSet(turn: TurnContext, search: SearchKind): Promise<ToolSet> {
  const { bridge } = useAssistantEditor()
  const { bridge: runForm } = useAssistantRunForm()
  const { bridge: profileForm } = useAssistantProfileForm()
  const { editorTools } = await import('@/lib/assistant/editorTools')
  const { runFormTools } = await import('@/lib/assistant/runFormTools')
  const { profileFormTools } = await import('@/lib/assistant/profileFormTools')
  const { watchTools } = await import('@/lib/assistant/watchTools')
  const { mergeTools } = await import('@/lib/assistant/tools')
  const { searchTools } = await import('@/lib/assistant/webSearch')
  const gate = approvalGate(turn)
  const local = mergeTools(
    await renderToolSet(turn),
    watchTools({ watch: (input) => addWatch(turn.chatId, input) }),
    bridge.value ? editorTools(bridge.value, gate) : {},
    runForm.value ? runFormTools(runForm.value, gate) : {},
    profileForm.value ? profileFormTools(profileForm.value, gate) : {},
    await searchTools(search),
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
  runningTurn.value = null
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
  const watches = watchRegistry?.list() ?? []
  watchStore?.save({ watches, unread: unreadChats.value })
  setWatchedJobs(watches.filter((watch) => watch.kind === 'job').map((watch) => watch.target))
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
  if (revisionTimer !== null) clearTimeout(revisionTimer)
  revisionTimer = null
  if (watchTimer === null) return
  clearInterval(watchTimer)
  watchTimer = null
  watchLead.release()
}

/** Takes in the watches other tabs put in the store; a job the last leader answered is gone from it. */
function reloadWatches() {
  if (watchStore && watchRegistry) watchRegistry.reload(watchStore.load().watches)
}

async function claimWatchLead(): Promise<boolean> {
  if (!(await watchLead.claim())) return false
  reloadWatches()
  return true
}

async function tickWatches() {
  if (!watchRegistry) {
    stopWatchTimer()
    return
  }
  if (await claimWatchLead()) await watchRegistry?.tick()
  pumpResumes()
  if (!watchRegistry?.list().length && !resumeQueue.length) stopWatchTimer()
}

function armWatchTimer() {
  if (watchTimer !== null || typeof setInterval !== 'function') return
  if (!watchRegistry?.list().length && !resumeQueue.length) return
  watchTimer = setInterval(() => void tickWatches(), WATCH_TICK_MS)
}

function addWatch(chatId: string, input: { kind: WatchKind; target: string; label: string }): WatchResult {
  if (!watchRegistry) return { ok: false, message: 'The portal cannot watch background work right now.' }
  // A tab that does not lead adds to what the store holds rather than over it.
  if (!watchLead.leading()) reloadWatches()
  const result = watchRegistry.add({ chatId, ...input })
  armWatchTimer()
  return result
}

function buildRegistry(watches: AssistantWatch[]): WatchRegistry {
  return createWatchRegistry({
    poll: watchPoller(client),
    resume: resumeChat,
    hasChat: (chatId) => chatState.chats.some((chat) => chat.id === chatId),
    load: () => watches,
    save: () => saveWatchState(),
  })
}

function startWatchers(scope: AssistantChatScope) {
  const store = createWatchStore(scope)
  const payload = store.load()
  watchStore = store
  watchLead.release()
  watchLead = watchLeadership(undefined, `${WATCH_LOCK_NAME}:${assistantChatScopeKey(scope)}`)
  applyUnread(payload.unread)
  watchRegistry = buildRegistry(payload.watches)
  armWatchTimer()
}

function stopWatchers() {
  stopWatchTimer()
  watchLead.release()
  watchRegistry = null
  watchStore = null
  resumeQueue.length = 0
  applyUnread({})
  clearLiveJobs()
}

/** Polls every watch now; the timer stays as the fallback for a dropped stream. */
async function pollWatchesNow() {
  if (!watchRegistry || !watchLead.leading()) return
  reloadWatches()
  await watchRegistry.tick(true)
  pumpResumes()
}

// The node reports every job state change over the notification stream, so
// the leading tab polls right away instead of at the next timer tick.
const notifications = useNotifications()
watch(notifications.dashboardRevision, () => {
  if (!notifications.available.value || !watchLead.leading() || !watchRegistry?.list().length) return
  if (revisionTimer !== null) clearTimeout(revisionTimer)
  revisionTimer = setTimeout(() => {
    revisionTimer = null
    void pollWatchesNow()
  }, REVISION_DEBOUNCE_MS)
})

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
  runningTurn.value = { chatId, messageId: assistantMessageId }
  const startedAt = Date.now()
  setMessagesOf(chatId, [
    ...messagesOf(chatId),
    { id: messageId, role: 'user', text: prompt, calls: [], at: startedAt, ...(resumeText === undefined ? {} : { background: true as const }) },
    {
      id: assistantMessageId,
      role: 'assistant',
      text: '',
      calls: [],
      at: startedAt,
      model: { providerId: selectedProvider.provider_id, providerLabel: selectedProvider.label, model: modelName },
    },
  ])
  if (resumeText === undefined && chat.title === 'New chat') {
    chat.title = chatTitle(prompt)
    markHead(chatId)
  }
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
    const direct = providers.direct(selectedProvider.provider_id)
    const kind = direct?.kind ?? selectedProvider.kind
    const openAiResponses = (direct?.kind === 'openai_compatible' && direct.protocol === 'responses')
      || selectedProvider.kind === 'chatgpt'
    const languageModel = direct
      ? buildBrowserModel({ ...direct, model: modelName })
      : buildModel(selectedProvider, modelName, modelContext)
    // No offered effort means the model does not reason; sending one would fault.
    const extras = {
      search: webSearch.value
        ? searchKind({
            kind,
            responses: openAiResponses,
            webSearch: selectedModel.value?.web_search,
            choice: direct?.kind === 'openai_compatible' ? direct.webSearch : undefined,
          })
        : 'none' as SearchKind,
      effort: effortOptions.value.length ? reasoningEffort.value : null,
    }
    const attempt = async () => {
      const tools = await toolSet(turn, extras.search)
      if (!isCurrentTurn(turn)) return null
      const req = turnRequest({ kind, responses: openAiResponses, effort: extras.effort, search: extras.search === 'openai' })
      return runTurn({
        model: languageModel,
        system: systemPrompt(context),
        messages: turnMessages,
        tools,
        abortSignal: turn.controller.signal,
        providerOptions: req.providerOptions,
        maxOutputTokens: req.maxOutputTokens,
        ...handlers,
      })
    }
    const handlers = {
      onText: (delta: string) => {
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
      onSource: (source) => {
        if (!isCurrentTurn(turn)) return
        const message = answer()
        if (!message || message.sources?.some((known) => known.url === source.url)) return
        message.sources = [...(message.sources ?? []), source]
      },
    } satisfies TurnHandlers
    let result = await attempt()
    if (!result) return
    const refused = direct?.kind === 'openai_compatible' ? refusedExtras(result.error) : null
    const retry = refused && ((refused.search && extras.search === 'openai') || (refused.reasoning && extras.effort))
    if (retry && !turn.controller.signal.aborted) {
      // The endpoint refused an extra it does not know: once more without it,
      // and remembered on the model so the next turn does not ask again.
      if (refused.search) extras.search = 'none'
      else extras.effort = null
      void providers.learnModel(
        selectedProvider.provider_id,
        modelName,
        refused.search ? { web_search: false } : { reasoning_efforts: [] },
      )
      const message = answer()
      if (message) {
        message.text = ''
        message.calls = []
      }
      result = await attempt()
      if (!result) return
      if (isShownTurn(turn)) toolsNote.value = refused.search ? NO_SEARCH_NOTE : NO_REASONING_NOTE
    }
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
      runningTurn.value = null
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

// ── Chats on the node ──────────────────────────────────────────────────────

const chatSyncs = new Map<string, ChatSync>()

function syncOf(chatId: string): ChatSync {
  let sync = chatSyncs.get(chatId)
  if (!sync) {
    sync = newChatSync()
    chatSyncs.set(chatId, sync)
  }
  return sync
}

function stopRemoteSync() {
  if (remoteSaveTimer !== null) clearTimeout(remoteSaveTimer)
  remoteSaveTimer = null
  remoteScopeKey = ''
  pushPending = false
  chatSyncs.clear()
}

function chatTurns(chat: AssistantChatRecord): ChatTurn[] {
  return splitTurns(chat.messages, chat.history)
}

function markHead(chatId: string) {
  syncOf(chatId).headDirty = true
}

/** Puts what the node confirmed into the live record; the next save keeps it. */
function recordCursor(chatId: string, sync: ChatSync) {
  const chat = chatById(chatId)
  if (chat) chat.remote = cursorOf(sync)
}

/** Starts a chat over as one the node does not hold. */
function startOver(chat: AssistantChatRecord) {
  const sync = syncOf(chat.id)
  resetSync(sync, chatTurns(chat))
  recordCursor(chat.id, sync)
}

/** Drops the chat from the node as well, where the node held it. */
function forgetChat(id: string) {
  const sync = chatSyncs.get(id)
  chatSyncs.delete(id)
  if (!sync?.revision) return
  void deleteChatOnNode(id, client()).catch(() => {
    // The delete is idempotent; a copy left behind comes back on the next login.
  })
}

function removeChat(id: string) {
  if (!chatStore || !chatById(id)) return
  const wasActive = activeChatId.value === id
  if (activeTurn?.chatId === id) discardTurn(abortTurn())
  // A deleted chat has nothing left to resume, so its watchers go with it.
  watchRegistry?.dropChat(id)
  markChatRead(id)
  chatSyncs.delete(id)
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

/** Shows the chat list and the active chat again after the node changed them. */
function refreshChats() {
  if (!chatStore) return
  saveChatState()
  const current = activeChat()
  messages.value = current?.messages ?? []
  history = current?.history ?? []
  updateChatList()
}

function chatFromHead(head: AssistantChatHead): AssistantChatRecord {
  return { ...newAssistantChat(head.title, Date.parse(head.created_at)), id: head.id }
}

/** Folds one chat the node holds into this browser: its turns after the local cursor, and its title. */
async function pullChat(head: AssistantChatHead): Promise<void> {
  const scopeKey = chatScopeKey
  const sync = syncOf(head.id)
  const before = chatById(head.id)
  const known = Boolean(before)
  if (before?.remote) restoreCursor(sync, chatTurns(before), before.remote)
  if (before && sync.revision === head.revision && sync.nextSeq === head.next_seq) {
    // Nothing moved on the node; only what this browser added since is unsent.
    markNew(sync, chatTurns(before))
    return
  }
  // The revision moved while next_seq did not: another browser rewrote the tail turn.
  const rewritten = known && sync.revision > 0 && sync.nextSeq === head.next_seq && head.next_seq > 0
  // A head this browser knows without any turn is read in full, not after -1.
  const after = rewritten
    ? (head.next_seq > 1 ? head.next_seq - 2 : undefined)
    : (known && sync.revision && sync.nextSeq > 0 ? sync.nextSeq - 1 : undefined)
  let pulled: ChatTurn[] = []
  if (after === undefined || head.next_seq > sync.nextSeq || rewritten) {
    let turns
    try {
      ({ turns } = await readTurns(head.id, after, client()))
    } catch (cause) {
      if (chatScopeKey === scopeKey && chatGone(cause)) removeChat(head.id)
      return
    }
    if (chatScopeKey !== scopeKey) return
    pulled = turns.flatMap((turn) => {
      const decoded = decodeTurn(turn.payload, Date.parse(turn.updated_at))
      if (decoded) sync.seqs.set(turnKey(decoded), turn.seq)
      return decoded ? [decoded] : []
    })
  }
  // The records are replaced on every save, so the chat is looked up again
  // after the read; one deleted meanwhile stays deleted.
  const local = chatById(head.id)
  if (known && !local) return
  const chat = local ?? chatFromHead(head)
  let turns = chatTurns(chat)
  if (rewritten && pulled.length) {
    // The node's tail replaces whatever this browser held at that seq, by key.
    const tail = turnKey(pulled[pulled.length - 1])
    const replaced = [...sync.seqs].filter(([key, seq]) => seq === head.next_seq - 1 && key !== tail).map(([key]) => key)
    for (const key of replaced) sync.seqs.delete(key)
    turns = turns.filter((turn) => !replaced.includes(turnKey(turn)))
  }
  const merged = mergeTurns(turns, pulled, (key) => sync.seqs.has(key))
  const joined = joinTurns(merged.turns)
  chat.messages = joined.messages
  chat.history = joined.history
  if (!sync.headDirty) {
    chat.title = head.title
    if (head.subject) chat.subject = head.subject
    else delete chat.subject
  }
  chat.updatedAt = Math.max(chat.updatedAt, Date.parse(head.updated_at))
  trackHead(sync, head)
  if (pulled.length) sync.tailKey = turnKey(pulled[pulled.length - 1])
  chat.remote = cursorOf(sync)
  sync.dirtyTurns = new Set(merged.unsent.map((_, index) => head.next_seq + index))
  if (!local) chatState = { ...chatState, chats: [...chatState.chats, chat] }
}

/** Reads what the node holds, folds it in, and marks what only this browser holds. */
async function syncChats(scopeKey: string) {
  let heads: AssistantChatHead[]
  try {
    ({ chats: heads } = await listChats(client()))
  } catch {
    // A node without the routes keeps every chat local; so does one that did
    // not answer, until the next login.
    return
  }
  if (chatScopeKey !== scopeKey || !chatStore) return
  await Promise.all(heads.map((head) => pullChat(head)))
  if (chatScopeKey !== scopeKey || !chatStore) return
  const held = new Set(heads.map((head) => head.id))
  for (const chat of chatState.chats) if (!held.has(chat.id)) startOver(chat)
  // A fresh browser opens on an empty chat; once the node's chats are in, the
  // one written to last is the one to show, not the empty placeholder.
  const current = activeChat()
  if (!current || (!current.messages.length && !current.history.length)) {
    const shown = [...chatState.chats].filter((chat) => chat.messages.length).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (shown) chatState = { ...chatState, activeChatId: shown.id }
  }
  remoteScopeKey = scopeKey
  refreshChats()
  queueRemoteSave()
}

function queueRemoteSave() {
  if (!chatScopeKey || remoteScopeKey !== chatScopeKey || remoteSaveTimer !== null) return
  remoteSaveTimer = setTimeout(() => {
    remoteSaveTimer = null
    void pushRemoteChats()
  }, REMOTE_SAVE_DELAY_MS)
}

async function pushRemoteChats() {
  const scopeKey = chatScopeKey
  if (!scopeKey || remoteScopeKey !== scopeKey) return
  if (remoteSaving) {
    pushPending = true
    return
  }
  remoteSaving = true
  try {
    for (const [id, sync] of [...chatSyncs]) {
      if (chatScopeKey !== scopeKey) return
      const chat = chatById(id)
      if (chat && (sync.headDirty || sync.dirtyTurns.size)) await pushChat(chat, sync, true)
    }
  } finally {
    remoteSaving = false
    // The cursors the writes moved are kept for the next reload.
    saveChatState()
    updateChatList()
    if (pushPending) {
      pushPending = false
      queueRemoteSave()
    }
  }
}

function headOf(chat: AssistantChatRecord, sync: ChatSync) {
  return {
    title: chat.title,
    ...(chat.subject ? { subject: chat.subject } : {}),
    ...(sync.revision ? { revision: sync.revision } : {}),
  }
}

/** The head first when it is new or changed, then the unsent turns in seq order. */
async function pushChat(chat: AssistantChatRecord, sync: ChatSync, retry: boolean): Promise<void> {
  const scopeKey = chatScopeKey
  // An empty chat never reaches the node; its head goes with its first turn.
  if (!sync.revision && !sync.dirtyTurns.size) return
  let writing: { seq: number; bytes: number } | null = null
  try {
    if (!sync.revision || sync.headDirty) {
      const fresh = !sync.revision
      const head = await putChat(chat.id, headOf(chat, sync), client())
      if (chatScopeKey !== scopeKey) return
      sync.headDirty = false
      if (fresh && head.next_seq > 0) {
        // The node already held turns for a chat this browser took for new.
        await pullChat(head)
        refreshChats()
        const again = chatById(chat.id)
        if (!again || chatScopeKey !== scopeKey) return
        chat = again
      } else {
        trackHead(sync, head)
        recordCursor(chat.id, sync)
      }
    }
    const turns = chatTurns(chat)
    const seqs = turnSeqs(sync, turns)
    for (const seq of [...sync.dirtyTurns].sort((a, b) => a - b)) {
      const index = seqs.indexOf(seq)
      if (index < 0) {
        sync.dirtyTurns.delete(seq)
        continue
      }
      const changes = sync.changes
      const request = { payload: encodeTurn(turns[index]), ...(sync.revision ? { revision: sync.revision } : {}) }
      if (sync.refused?.seq === seq && sync.refused.bytes === request.payload.length) {
        sync.dirtyTurns.delete(seq)
        continue
      }
      writing = { seq, bytes: request.payload.length }
      const head = await putTurn(chat.id, seq, request, client())
      if (chatScopeKey !== scopeKey) return
      if (sync.refused?.seq === seq) delete sync.refused
      trackHead(sync, head)
      sync.seqs.set(turnKey(turns[index]), seq)
      sync.tailKey = turnKey(turns[index])
      recordCursor(chat.id, sync)
      // A turn marked again while the write was out is written once more.
      if (sync.changes === changes) sync.dirtyTurns.delete(seq)
    }
  } catch (cause) {
    if (chatScopeKey !== scopeKey) return
    if (chatGone(cause)) {
      removeChat(chat.id)
      return
    }
    // Anything but these waits for the next queued save.
    if (!(cause instanceof ApiError)) return
    if (cause.status === 404) startOver(chat)
    else if (cause.status === 409) await pullConflict(chat.id)
    else if (cause.status === 413) {
      sync.headDirty = false
      sync.dirtyTurns.clear()
      if (writing) sync.refused = writing
      // Said once; the turn is tried again only once it changes.
      if (isActiveChat(chat.id)) error.value = `The node did not keep the last turn: ${cause.message}`
      return
    } else return
    const again = chatById(chat.id)
    if (retry && again) await pushChat(again, sync, false)
  }
}

/** After a 409: the node's turns and revision, with this browser's unsent turns after them. */
async function pullConflict(chatId: string) {
  const scopeKey = chatScopeKey
  let heads: AssistantChatHead[]
  try {
    ({ chats: heads } = await listChats(client()))
  } catch {
    return
  }
  if (chatScopeKey !== scopeKey) return
  const head = heads.find((entry) => entry.id === chatId)
  const chat = chatById(chatId)
  if (!chat) return
  if (head) await pullChat(head)
  else startOver(chat)
  if (chatScopeKey === scopeKey) refreshChats()
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
  stopRemoteSync()
  stopWatchers()
  clearChatState()
  if (!scope) return

  const nextStore = createAssistantChatStore(scope)
  chatStore = nextStore
  chatScopeKey = nextStore.key
  historyReady.value = true
  applyChatState(nextStore.load())
  startWatchers(scope)
  void syncChats(nextStore.key)
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
// A change on a chat with history waits here until it is confirmed, and a
// removed provider leaves the selection empty until one is picked.
const switching = ref<{ providerId: string; modelId: string } | null>(null)
const removed = ref<{ id: string; label: string } | null>(null)
const provider = computed<AssistantProvider | null>(() =>
  ready.value.find((entry) => entry.provider_id === providerId.value) ?? (removed.value ? null : ready.value[0] ?? null))
const model = computed(() => (provider.value ? providerModelId(provider.value, modelId.value) : ''))

/** What the pending change would do, for the notice above the composer. */
const switchNotice = computed(() => {
  const next = switching.value
  if (!next) return null
  const target = (next.providerId ? ready.value.find((entry) => entry.provider_id === next.providerId) : null) ?? provider.value
  if (!target) return null
  return {
    providerId: target.provider_id,
    providerLabel: target.label,
    model: providerModelId(target, next.modelId),
    messages: messages.value.length,
    kiloChars: Math.max(1, Math.round(JSON.stringify(history).length / 1000)),
  }
})

watch(assistantRemovedProvider, (gone) => {
  if (!gone || (provider.value?.provider_id !== gone.id && providerId.value !== gone.id)) return
  providerId.value = ''
  modelId.value = ''
  storeValue(PROVIDER_KEY, '')
  storeValue(MODEL_KEY, '')
  switching.value = null
  removed.value = gone
}, { flush: 'sync' })

const warning = computed(() => {
  if (removed.value) return `The provider ${removed.value.label} was removed. Pick a provider to continue.`
  if (providers.providers.value.length && !ready.value.length) return 'No provider is ready.'
  return ''
})
watch(warning, (value) => {
  assistantWarning.value = value
}, { immediate: true, flush: 'sync' })
watch(activeChatId, () => {
  switching.value = null
})
// What the provider offers now, ahead of the ids stored when it was added.
const modelChoices = computed(() => (provider.value
  ? modelSuggestions(provider.value, providers.listedModels.value[provider.value.provider_id] ?? [])
  : []))
const modelsError = computed(() =>
  (provider.value ? providers.modelErrors.value[provider.value.provider_id] ?? null : null))
// The active model object: the fetched entry, with what the stored record
// learned about the model on top of it.
const selectedModel = computed<AssistantModel | null>(() => {
  const current = provider.value
  if (!current) return null
  const id = model.value
  const listed = (providers.listedModels.value[current.provider_id] ?? []).find((entry) => entry.id === id)
  const stored = current.models.find((entry) => entry.id === id)
  return listed || stored ? { ...listed, ...stored, id } : null
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

  function applySelection(nextProvider: string, nextModel: string) {
    providerId.value = nextProvider
    modelId.value = nextModel
    storeValue(PROVIDER_KEY, nextProvider)
    storeValue(MODEL_KEY, nextModel)
    removed.value = null
    switching.value = null
  }

  // A row for the reader alone, saying which model answers from here on.
  function noteModelChange() {
    const current = activeChat()
    if (!current || !model.value) return
    setMessagesOf(current.id, [
      ...messagesOf(current.id),
      { id: nextId(), role: 'user', text: `Model changed to ${model.value}`, calls: [], at: Date.now(), marker: true },
    ])
    persistChat(current.id)
  }

  // A change on a chat with history is confirmed first, because the new model
  // reads the whole chat again; after a removal there is nothing to keep.
  function selectProvider(id: string) {
    syncEpoch()
    if (providerId.value === id && !removed.value) return
    const asked = messages.value.length > 0
    if (asked && !removed.value) {
      switching.value = { providerId: id, modelId: '' }
      return
    }
    applySelection(id, '')
    if (asked) noteModelChange()
  }

  // Any id goes: a fine-tune or a model newer than the fetched list.
  function selectModel(id: string) {
    syncEpoch()
    const next = id.trim()
    if (!next || next === model.value) return
    if (messages.value.length) {
      switching.value = { providerId: providerId.value, modelId: next }
      return
    }
    applySelection(providerId.value, next)
  }

  function confirmSwitch() {
    const next = switching.value
    if (!next) return
    applySelection(next.providerId, next.modelId)
    noteModelChange()
  }

  function keepCurrent() {
    switching.value = null
  }

  function setApproveWrites(value: boolean) {
    approveWrites.value = value
    storeValue(APPROVE_KEY, value ? 'on' : 'off')
  }

  function setWebSearch(value: boolean) {
    webSearch.value = value
    storeValue(SEARCH_KEY, value ? 'on' : 'off')
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
    if (!chatStore || !historyReady.value || !chatById(id)) return
    forgetChat(id)
    removeChat(id)
  }

  function renameChat(id: string, title: string) {
    syncEpoch()
    if (!chatStore || !historyReady.value) return
    const chat = chatById(id)
    if (!chat) return
    chat.title = title.trim().slice(0, 80) || 'New chat'
    chat.updatedAt = Date.now()
    markHead(id)
    persistChatState()
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
  // A subject the running chat is not about starts a fresh one, so a question
  // from another page does not land in the middle of an unrelated conversation.
  function openWith(prompt: string, subject?: string) {
    openPanel()
    const topic = subject?.trim().slice(0, 80)
    const current = activeChat()
    if (topic && current && current.messages.length && current.subject !== topic) newChat()
    const chat = activeChat()
    if (chat && topic && chat.subject !== topic) {
      chat.subject = topic
      markHead(chat.id)
      persistChatState()
    }
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
    working,
    workingLabel,
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
    providerId,
    providers: ready,
    model,
    modelChoices,
    modelsError,
    loadModels,
    available,
    approveWrites,
    webSearch,
    reasoningEffort,
    effortOptions,
    selectProvider,
    selectModel,
    switchNotice,
    confirmSwitch,
    keepCurrent,
    removed,
    setApproveWrites,
    setWebSearch,
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
