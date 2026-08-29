<script setup lang="ts">
// Add or edit one direct browser provider. Credentials stay in this tab's
// session store; a candidate is tested before it is persisted.
import { computed, reactive, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import type { AssistantModel, AssistantProvider } from '@/lib/api'
import {
  BROWSER_PROVIDER_KINDS,
  OPENAI_COMPATIBLE_PRESETS,
  validateBrowserProvider,
  type BrowserProvider,
  type BrowserProviderKind,
  type OpenAICompatibleProtocol,
} from '@/lib/assistant/browserProviders'
import { modelSuggestions, normalizeModelId } from '@/lib/assistant/modelOptions'
import { errorMessage } from '@/lib/utils'
import { ChevronRight, Plus, X } from '@lucide/vue'

const props = defineProps<{ provider?: AssistantProvider | null }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'cancel'): void }>()

const { create, update, check, models: fetchModels, direct } = useAssistantProviders()
const existingDirect = props.provider ? direct(props.provider.provider_id) : null
const existingCompatible = existingDirect?.kind === 'openai_compatible' ? existingDirect : null
const initialKind: BrowserProviderKind = existingDirect?.kind
  ?? (props.provider?.kind === 'openai_compatible' ? 'openai_compatible' : 'anthropic')

const editing = computed(() => Boolean(props.provider))
const kind = ref<BrowserProviderKind>(initialKind)
const label = ref(props.provider?.label ?? '')
const apiKey = ref('')
const baseUrl = ref(existingCompatible?.baseUrl ?? (initialKind === 'openai_compatible' ? OPENAI_COMPATIBLE_PRESETS[0].baseUrl : ''))
const protocol = ref<OpenAICompatibleProtocol>(existingCompatible?.protocol ?? 'responses')
const headers = reactive<Array<{ name: string; value: string }>>(
  Object.entries(existingCompatible?.headers ?? {}).map(([name, value]) => ({ name, value })),
)
const headersOpen = ref(false)
const models = ref<AssistantModel[]>(props.provider?.models ?? existingDirect?.models ?? [])
const defaultModel = ref(existingDirect?.model ?? props.provider?.default_model ?? '')
const providerId = ref(props.provider?.provider_id ?? '')
const testedFingerprint = ref('')
const busy = ref(false)
const message = ref<string | null>(null)
const failure = ref<string | null>(null)
const MODEL_LISTING_PLACEHOLDER = '__model_listing__'

const kindLabels: Record<BrowserProviderKind, string> = {
  anthropic: 'Claude',
  openai_compatible: 'OpenAI-compatible',
}
const kindOptions = BROWSER_PROVIDER_KINDS.map((value) => ({ value, label: kindLabels[value] }))
const protocolOptions = [
  { value: 'responses', label: 'Responses' },
  { value: 'chat_completions', label: 'Chat Completions' },
] satisfies Array<{ value: OpenAICompatibleProtocol; label: string }>
// Fetched ids are suggestions; any id typed by hand is accepted as well.
const suggestions = computed(() =>
  modelSuggestions({ kind: kind.value, models: models.value }, models.value))
const needsBaseUrl = computed(() => kind.value === 'openai_compatible')
const officialOpenAi = computed(() =>
  needsBaseUrl.value
  && baseUrl.value.trim().replace(/\/+$/, '') === OPENAI_COMPATIBLE_PRESETS[0].baseUrl)
const canTest = computed(() => {
  if (!label.value.trim() || !defaultModel.value.trim()) return false
  try {
    validateBrowserProvider(candidate())
    return true
  } catch {
    return false
  }
})
const canFetchModels = computed(() => {
  try {
    validateBrowserProvider(candidate(MODEL_LISTING_PLACEHOLDER, true))
    return true
  } catch {
    return false
  }
})

function ensureProviderId(): string {
  if (providerId.value) return providerId.value
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  providerId.value = `browser-${random}`
  return providerId.value
}

function headerMap(): Record<string, string> | undefined {
  const entries = headers.filter((header) => header.name.trim())
  if (!entries.length) return undefined
  return Object.fromEntries(entries.map((header) => [header.name.trim(), header.value]))
}

function candidate(modelOverride = defaultModel.value, listing = false): BrowserProvider {
  const id = ensureProviderId()
  const common = {
    id,
    label: label.value.trim() || (listing ? 'Model listing' : ''),
    model: normalizeModelId(modelOverride) || (listing ? MODEL_LISTING_PLACEHOLDER : ''),
    models: models.value,
  }
  if (kind.value === 'anthropic') {
    const key = apiKey.value.trim() || (existingDirect?.kind === 'anthropic' ? existingDirect.apiKey : '')
    return { ...common, kind: 'anthropic', apiKey: key }
  }
  const key = apiKey.value.trim() || existingCompatible?.apiKey
  const customHeaders = headerMap()
  return {
    ...common,
    kind: 'openai_compatible',
    baseUrl: baseUrl.value.trim(),
    protocol: protocol.value,
    ...(key ? { apiKey: key } : {}),
    ...(customHeaders ? { headers: customHeaders } : {}),
  }
}

function fingerprint(provider: BrowserProvider): string {
  return JSON.stringify(provider)
}

const testedForCurrent = computed(() => {
  if (!testedFingerprint.value) return false
  return testedFingerprint.value === fingerprint(candidate())
})
const canSave = computed(() => testedForCurrent.value && Boolean(defaultModel.value.trim()) && !busy.value)

function setKind(value: string) {
  const next = value as BrowserProviderKind
  if (next === kind.value) return
  kind.value = next
  apiKey.value = ''
  defaultModel.value = ''
  models.value = []
  headers.splice(0, headers.length)
  testedFingerprint.value = ''
  message.value = null
  failure.value = null
  baseUrl.value = next === 'openai_compatible' ? OPENAI_COMPATIBLE_PRESETS[0].baseUrl : ''
  protocol.value = 'responses'
}

async function test() {
  if (!canTest.value) return
  busy.value = true
  message.value = null
  failure.value = null
  const value = candidate()
  try {
    const result = await check(value)
    if (result.ok) {
      testedFingerprint.value = fingerprint(value)
      message.value = result.message || 'The provider answered.'
    } else {
      testedFingerprint.value = ''
      failure.value = result.message || 'The provider refused the credentials.'
    }
  } catch (cause) {
    testedFingerprint.value = ''
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function loadModels() {
  if (!canFetchModels.value) return
  busy.value = true
  failure.value = null
  try {
    const listed = await fetchModels(candidate(MODEL_LISTING_PLACEHOLDER, true))
    models.value = listed
    if (!defaultModel.value && listed.length) defaultModel.value = listed[0].id
    if (!listed.length) message.value = 'This endpoint does not list models; enter the model id manually.'
    else message.value = `${listed.length} model${listed.length === 1 ? '' : 's'} available.`
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function save() {
  if (!testedForCurrent.value) return
  busy.value = true
  failure.value = null
  try {
    const value = candidate()
    if (existingDirect) await update(value.id, value)
    else await create(value)
    emit('done')
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-foreground">Provider</label>
        <Select
          v-if="!editing"
          :model-value="kind"
          :options="kindOptions"
          class="mt-1"
          aria-label="Provider kind"
          @update:model-value="setKind"
        />
        <p v-else class="mt-2 text-sm text-foreground">{{ kind === 'anthropic' ? 'Claude' : 'OpenAI-compatible' }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Display name</label>
        <Input v-model="label" class="mt-1" placeholder="Work account" />
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">{{ kind === 'anthropic' ? 'Anthropic API key' : officialOpenAi ? 'OpenAI API key' : 'API key (optional)' }}</label>
        <Input
          v-model="apiKey"
          class="mt-1"
          type="password"
          :placeholder="editing ? 'Stored in this tab; type to replace' : kind === 'anthropic' ? 'Paste the Anthropic key' : officialOpenAi ? 'Paste the OpenAI key' : 'Optional for local endpoints'"
        />
        <p class="mt-1 text-[11px] text-muted-foreground">
          Kept in this tab's session only; it is never sent to the Aruna provider routes.
        </p>
      </div>
      <div v-if="needsBaseUrl">
        <label class="text-xs font-medium text-foreground">API root</label>
        <Input v-model="baseUrl" class="mt-1" placeholder="https://api.openai.com/v1" />
        <p class="mt-1 text-[11px] text-muted-foreground">
          Defaults to OpenAI Responses. Keep the endpoint root exact; replace it with a local Ollama, LM Studio, or vLLM root as needed.
        </p>
      </div>
      <div v-if="needsBaseUrl">
        <label class="text-xs font-medium text-foreground">Protocol</label>
        <Select
          :model-value="protocol"
          :options="protocolOptions"
          class="mt-1"
          aria-label="OpenAI protocol"
          @update:model-value="(value) => (protocol = value as OpenAICompatibleProtocol)"
        />
      </div>
    </div>

    <div v-if="needsBaseUrl">
      <button
        type="button"
        class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        :aria-expanded="headersOpen"
        @click="headersOpen = !headersOpen"
      >
        <ChevronRight :class="['h-3.5 w-3.5 transition-transform', headersOpen && 'rotate-90']" />
        Custom headers
      </button>
      <div v-if="headersOpen" class="mt-2 space-y-2">
        <p class="text-[11px] text-muted-foreground">Optional headers are kept in this tab's session only.</p>
        <div v-for="(header, index) in headers" :key="index" class="flex items-center gap-2">
          <Input v-model="header.name" class="w-48" placeholder="Header" />
          <Input v-model="header.value" class="flex-1" placeholder="Value" type="password" />
          <Button variant="ghost" size="icon-sm" aria-label="Remove header" @click="headers.splice(index, 1)">
            <X class="size-3.5" />
          </Button>
        </div>
        <Button variant="outline" size="sm" @click="headers.push({ name: '', value: '' })">
          <Plus class="h-3.5 w-3.5" /> Add a header
        </Button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" :disabled="!canTest || busy" @click="test">Test connection</Button>
      <Button variant="outline" size="sm" :disabled="!canFetchModels || busy" @click="loadModels">Fetch models</Button>
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-foreground">Model</label>
        <ModelCombobox
          v-model="defaultModel"
          :suggestions="suggestions"
          class="h-8 w-64"
          aria-label="Default model"
          required
          placeholder="Enter a model id"
        />
      </div>
    </div>

    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <Notice v-else-if="message" tone="success">{{ message }}</Notice>
    <p v-else-if="!testedForCurrent" class="text-[11px] text-muted-foreground">
      Test this candidate before saving. Model ids can be entered manually when the endpoint has no model list.
    </p>

    <div class="flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
      <Button size="sm" :disabled="!canSave" @click="save">{{ busy ? 'Saving…' : 'Save provider' }}</Button>
    </div>
  </div>
</template>
