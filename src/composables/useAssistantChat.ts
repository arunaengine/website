// The chat panel's session: one provider, one model, one conversation held in
// memory, shared by the launcher and the panel. The AI SDK and the MCP client
// are only imported once a message is actually sent.
import { computed, ref, watch } from 'vue'
import type { ModelMessage, ToolSet } from 'ai'
import { createSession, providerModelId, type AssistantProvider } from '@/lib/api'
import { apiBaseUrl, authToken, readStored, realmInfo, sessionEpoch, storeValue } from './aruna/state'
import { loadRoCrate } from './aruna/crates'
import { useAssistantProviders } from './useAssistantProviders'
import { useAssistantEditor } from './useAssistantEditor'
import type { McpConnection } from '@/lib/assistant/mcpClient'
import type { PromptContext } from '@/lib/assistant/prompt'
import type { ApprovalGate, ApprovalRequest, ChatMessage, ToolCallView } from '@/lib/assistant/types'
import { errorMessage } from '@/lib/utils'

const PROVIDER_KEY = 'aruna.assistant.provider'
const MODEL_KEY = 'aruna.assistant.model'
const APPROVE_KEY = 'aruna.assistant.approve'
const SESSION_MARGIN_MS = 60_000

export interface PendingApproval {
  request: ApprovalRequest
  /** True for a draft delete, which asks whatever the toggle says. */
  always: boolean
  decide: (approved: boolean) => void
}

const open = ref(false)
const busy = ref(false)
const messages = ref<ChatMessage[]>([])
const error = ref<string | null>(null)
const toolsNote = ref<string | null>(null)
const pending = ref<PendingApproval | null>(null)
const providerId = ref(readStored(PROVIDER_KEY))
const modelId = ref(readStored(MODEL_KEY))
const approveWrites = ref(readStored(APPROVE_KEY) !== 'off')

let history: ModelMessage[] = []
let counter = 0
let session: { token: string; expiresAt: number; epoch: number } | null = null
let sessionInFlight: { epoch: number; promise: Promise<string> } | null = null
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
  counter += 1
  return `m${counter}`
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
    const promise = createSession({ kind: 'assistant', label: 'Portal chat' }, client(), signal).then((minted) => {
      if (epoch !== sessionEpoch.value) throw abortError()
      session = { token: minted.token, expiresAt: new Date(minted.expires_at).getTime(), epoch }
      return minted.token
    })
    sessionInFlight = { epoch, promise }
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
  abortTurn()
  session = null
  sessionInFlight = null
  void closeConnection()
  resetConversation()
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

function syncEpoch() {
  if (assistantEpoch === sessionEpoch.value) return
  assistantEpoch = sessionEpoch.value
  resetAssistantSession()
}

watch(sessionEpoch, () => syncEpoch())

export function useAssistantChat() {
  const providers = useAssistantProviders()

  const ready = computed(() => providers.ready.value)
  const provider = computed<AssistantProvider | null>(() =>
    ready.value.find((entry) => entry.provider_id === providerId.value) ?? ready.value[0] ?? null)
  const model = computed(() => (provider.value ? providerModelId(provider.value, modelId.value) : ''))
  const available = computed(() => ready.value.length > 0)

  function selectProvider(id: string) {
    syncEpoch()
    if (providerId.value === id) return
    abortTurn()
    resetConversation()
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
    abortTurn()
    resetConversation()
    modelId.value = next
    storeValue(MODEL_KEY, modelId.value)
  }

  function setApproveWrites(value: boolean) {
    approveWrites.value = value
    storeValue(APPROVE_KEY, value ? 'on' : 'off')
  }

  function newChat() {
    syncEpoch()
    abortTurn()
    resetConversation()
  }

  function openPanel() {
    syncEpoch()
    open.value = true
    void providers.load()
    if (realmInfo.value?.interfaces.mcp?.url) {
      void sessionToken().catch(() => {
        // A node that refuses the mint leaves the editor tools working.
      })
    }
  }

  function hidePanel() {
    open.value = false
  }

  function closePanel() {
    syncEpoch()
    open.value = false
    discardTurn(abortTurn())
  }

  async function send(text: string, context: PromptContext) {
    const prompt = text.trim()
    syncEpoch()
    const selectedProvider = provider.value
    const selectedModel = model.value
    if (!prompt || busy.value || !selectedProvider || !selectedModel) return
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
      const result = await runTurn({
        model: languageModel,
        system: systemPrompt(context),
        messages: turnMessages,
        tools,
        abortSignal: turn.controller.signal,
        ...(openAiResponses ? { providerOptions: { openai: { store: false } } } : {}),
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
      }
    }
  }

  return {
    open,
    busy,
    messages,
    error,
    toolsNote,
    pending,
    provider,
    providers: ready,
    model,
    available,
    approveWrites,
    selectProvider,
    selectModel,
    setApproveWrites,
    openPanel,
    hidePanel,
    closePanel,
    newChat,
    send,
    ensureProviders: providers.ensureLoaded,
  }
}
