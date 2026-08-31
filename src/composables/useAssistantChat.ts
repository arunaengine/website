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
import type { McpConnection } from '@/lib/assistant/mcpClient'
import type { PromptContext } from '@/lib/assistant/prompt'
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
import { errorMessage } from '@/lib/utils'
import { assistantAvailable as available, assistantOpen as open } from './assistantState'

const PROVIDER_KEY = 'aruna.assistant.provider'
const MODEL_KEY = 'aruna.assistant.model'
const APPROVE_KEY = 'aruna.assistant.approve'
const EFFORT_KEY = 'aruna.assistant.effort'
const SESSION_MARGIN_MS = 60_000

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

interface TurnContext {
  generation: number
  userMessageId: string
  messageId: string
  controller: AbortController
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

function abortError(): DOMException {
  return new DOMException('The assistant session changed.', 'AbortError')
}

function patchCall(messageId: string, id: string, patch: Partial<ToolCallView>) {
  const message = messages.value.find((entry) => entry.id === messageId)
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
  patchCall(entry.turn.messageId, entry.request.id, { state: approved ? 'running' : 'denied' })
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
  patchCall(entry.turn.messageId, entry.request.id, { state: 'approval' })
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
      if (!isCurrentTurn(turn)) {
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
    if (isCurrentTurn(turn)) toolsNote.value = 'This node serves no MCP endpoint, so only the open editor can be used.'
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
  const source = connection
  if (!source) throw abortError()
  const descriptors = await source.listTools()
  if (!isCurrentTurn(turn)) throw abortError()
  return nodeTools(descriptors, source, gate)
}

// The cards a render tool asks for stay on the call; the model only hears "shown".
async function renderToolSet(turn: TurnContext): Promise<ToolSet> {
  const { renderTools } = await import('@/lib/assistant/renderTools')
  return renderTools({
    keep: (id, view) => {
      if (isCurrentTurn(turn)) patchCall(turn.messageId, id, { view })
    },
    loadCrate: loadRoCrate,
  })
}

async function toolSet(turn: TurnContext): Promise<ToolSet> {
  const { bridge } = useAssistantEditor()
  const { editorTools } = await import('@/lib/assistant/editorTools')
  const { mergeTools } = await import('@/lib/assistant/tools')
  const gate = approvalGate(turn)
  const local = mergeTools(await renderToolSet(turn), bridge.value ? editorTools(bridge.value, gate) : {})
  try {
    const remote = await nodeToolSet(turn, gate)
    if (isCurrentTurn(turn) && realmInfo.value?.interfaces.mcp?.url) toolsNote.value = null
    return mergeTools(remote, local)
  } catch (cause) {
    if (isCurrentTurn(turn)) {
      toolsNote.value = `The node tools are unavailable: ${errorMessage(cause)}`
      await closeConnection()
    }
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
  return turn
}

function discardTurn(turn: TurnContext | null) {
  if (!turn) return
  messages.value = messages.value.filter((message) =>
    message.id !== turn.userMessageId && message.id !== turn.messageId)
}

function resetAssistantSession() {
  discardTurn(abortTurn())
  session = null
  sessionInFlight = null
  void closeConnection()
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
  clearChatState()
  if (!scope) return

  const nextStore = createAssistantChatStore(scope)
  chatStore = nextStore
  chatScopeKey = nextStore.key
  historyReady.value = true
  applyChatState(nextStore.load())
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

export function useAssistantChat() {
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
    if (activeChatId.value === id) return
    discardTurn(abortTurn())
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
    if (wasActive) discardTurn(abortTurn())
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

  function hidePanel() {
    open.value = false
  }

  function closePanel() {
    syncEpoch()
    open.value = false
    discardTurn(abortTurn())
    persistCurrentChat()
  }

  async function send(text: string, context: PromptContext) {
    const prompt = text.trim()
    syncEpoch()
    const selectedProvider = provider.value
    const selectedModel = model.value
    if (!prompt || busy.value || !selectedProvider || !selectedModel || !chatStore || !historyReady.value) return
    const current = activeChat()
    if (!current) return
    error.value = null
    busy.value = true
    const messageId = nextId()
    const assistantMessageId = nextId()
    const turn: TurnContext = {
      generation: ++turnGeneration,
      userMessageId: messageId,
      messageId: assistantMessageId,
      controller: new AbortController(),
    }
    activeTurn = turn
    messages.value = [
      ...messages.value,
      { id: messageId, role: 'user', text: prompt, calls: [] },
      { id: assistantMessageId, role: 'assistant', text: '', calls: [] },
    ]
    if (current.title === 'New chat') current.title = chatTitle(prompt)
    updateChatList()
    const turnMessages: ModelMessage[] = [...history, { role: 'user', content: prompt }]
    const modelContext = { apiBaseUrl: apiBaseUrl.value, token: authToken.value }
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
        ? buildBrowserModel({ ...direct, model: selectedModel })
        : buildModel(selectedProvider, selectedModel, modelContext)
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
          const message = messages.value.find((entry) => entry.id === assistantMessageId)
          if (message) message.text += delta
        },
        onToolCall: (call) => {
          if (!isCurrentTurn(turn)) return
          const message = messages.value.find((entry) => entry.id === assistantMessageId)
          if (!message) return
          message.calls = [...message.calls, { ...call, state: 'running' }]
        },
        onToolResult: ({ id, output }) => {
          if (!isCurrentTurn(turn)) return
          const message = messages.value.find((entry) => entry.id === assistantMessageId)
          const denied = message?.calls.find((call) => call.id === id)?.state === 'denied'
          if (denied) patchCall(assistantMessageId, id, { output })
          else patchCall(assistantMessageId, id, { state: 'done', output })
        },
        onToolError: ({ id, message: toolError }) => {
          if (isCurrentTurn(turn)) patchCall(assistantMessageId, id, { state: 'error', error: toolError })
        },
      })
      if (!isCurrentTurn(turn)) return
      if (result.error && !turn.controller.signal.aborted) {
        error.value = result.error
        const message = messages.value.find((entry) => entry.id === assistantMessageId)
        if (message) message.error = result.error
      } else if (!result.error) {
        history = [...turnMessages, ...result.messages]
      }
    } catch (cause) {
      if (isCurrentTurn(turn) && !turn.controller.signal.aborted) {
        error.value = errorMessage(cause)
        const message = messages.value.find((entry) => entry.id === assistantMessageId)
        if (message) message.error = error.value
      }
    } finally {
      if (activeTurn === turn) {
        activeTurn = null
        busy.value = false
        persistCurrentChat()
      }
    }
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
