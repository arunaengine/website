// The chat panel's session: one provider, one model, one conversation held in
// memory. Module singleton, so the launcher, the panel and the editor bridge
// all see the same state.
import { computed, ref } from 'vue'
import type { ModelMessage, ToolSet } from 'ai'
import { createSession, type AssistantProvider } from '@/lib/api'
import { apiBaseUrl, authToken, readStored, realmInfo, storeValue } from './aruna/state'
import { useAssistantProviders } from './useAssistantProviders'
import { useAssistantEditor } from './useAssistantEditor'
import { runTurn } from '@/lib/assistant/chat'
import { connectMcp, type McpConnection } from '@/lib/assistant/mcpClient'
import { editorTools } from '@/lib/assistant/editorTools'
import { buildModel, providerModelId } from '@/lib/assistant/models'
import { mergeTools, nodeTools } from '@/lib/assistant/tools'
import { systemPrompt, type PromptContext } from '@/lib/assistant/prompt'
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
let session: { token: string; expiresAt: number } | null = null
let connection: McpConnection | null = null
let connectionToken = ''

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function nextId(): string {
  counter += 1
  return `m${counter}`
}

/** The child session the MCP client authenticates with; re-minted on expiry. */
async function sessionToken(): Promise<string> {
  if (session && session.expiresAt - Date.now() > SESSION_MARGIN_MS) return session.token
  const minted = await createSession({ kind: 'assistant', label: 'Portal chat' }, client())
  session = { token: minted.token, expiresAt: new Date(minted.expires_at).getTime() }
  return session.token
}

const gate: ApprovalGate = {
  enabled: () => approveWrites.value,
  ask: (request, always) => new Promise<boolean>((resolve) => {
    patchCall(request.id, { state: 'approval' })
    pending.value = {
      request,
      always,
      decide: (approved) => {
        pending.value = null
        patchCall(request.id, { state: approved ? 'running' : 'denied' })
        resolve(approved)
      },
    }
  }),
}

function current(): ChatMessage | undefined {
  return messages.value.at(-1)
}

function patchCall(id: string, patch: Partial<ToolCallView>) {
  const message = current()
  if (!message) return
  message.calls = message.calls.map((call) => (call.id === id ? { ...call, ...patch } : call))
}

async function nodeToolSet(): Promise<ToolSet> {
  const url = realmInfo.value?.interfaces.mcp?.url
  if (!url) {
    toolsNote.value = 'This node serves no MCP endpoint, so only the open editor can be used.'
    return {}
  }
  const token = await sessionToken()
  if (!connection || connectionToken !== token) {
    connection = await connectMcp(url, token)
    connectionToken = token
  }
  return nodeTools(await connection.listTools(), connection, gate)
}

async function toolSet(): Promise<ToolSet> {
  const { bridge } = useAssistantEditor()
  const local = bridge.value ? editorTools(bridge.value, gate) : {}
  try {
    return mergeTools(await nodeToolSet(), local)
  } catch (cause) {
    toolsNote.value = `The node tools are unavailable: ${errorMessage(cause)}`
    connection = null
    return local
  }
}

export function useAssistantChat() {
  const providers = useAssistantProviders()

  const ready = computed(() => providers.ready.value)
  const provider = computed<AssistantProvider | null>(() =>
    ready.value.find((entry) => entry.provider_id === providerId.value) ?? ready.value[0] ?? null)
  const model = computed(() => (provider.value ? providerModelId(provider.value, modelId.value) : ''))
  const available = computed(() => ready.value.length > 0)

  function selectProvider(id: string) {
    providerId.value = id
    storeValue(PROVIDER_KEY, id)
    modelId.value = ''
    storeValue(MODEL_KEY, '')
  }

  function selectModel(id: string) {
    modelId.value = id
    storeValue(MODEL_KEY, id)
  }

  function setApproveWrites(value: boolean) {
    approveWrites.value = value
    storeValue(APPROVE_KEY, value ? 'on' : 'off')
  }

  function newChat() {
    history = []
    messages.value = []
    error.value = null
    pending.value?.decide(false)
  }

  function openPanel() {
    open.value = true
    void providers.load()
    void sessionToken().catch(() => {
      // A node that refuses the mint leaves the editor tools working.
    })
  }

  function closePanel() {
    open.value = false
    pending.value?.decide(false)
  }

  async function send(text: string, context: PromptContext) {
    const prompt = text.trim()
    if (!prompt || busy.value || !provider.value) return
    error.value = null
    busy.value = true
    messages.value = [
      ...messages.value,
      { id: nextId(), role: 'user', text: prompt, calls: [] },
      { id: nextId(), role: 'assistant', text: '', calls: [] },
    ]
    history = [...history, { role: 'user', content: prompt }]
    try {
      const tools = await toolSet()
      const result = await runTurn({
        model: buildModel(provider.value, model.value, { apiBaseUrl: apiBaseUrl.value, token: authToken.value }),
        system: systemPrompt(context),
        messages: history,
        tools,
        onText: (delta) => {
          const message = current()
          if (message) message.text += delta
        },
        onToolCall: (call) => {
          const message = current()
          if (!message) return
          message.calls = [...message.calls, { ...call, state: 'running' }]
        },
        onToolResult: ({ id, output }) => patchCall(id, { state: 'done', output }),
        onToolError: ({ id, message }) => patchCall(id, { state: 'error', error: message }),
      })
      history = [...history, ...result.messages]
      if (result.error) {
        error.value = result.error
        const message = current()
        if (message) message.error = result.error
      }
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      busy.value = false
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
    closePanel,
    newChat,
    send,
    ensureProviders: providers.ensureLoaded,
  }
}
