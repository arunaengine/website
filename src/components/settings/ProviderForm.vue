<script setup lang="ts">
// Add or edit one provider in two steps: pick the kind, then fill only what
// that kind needs. Browser credentials stay in this tab's session store and a
// candidate is tested before it can be saved.
import { computed, reactive, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import ChatGptLogin from './ChatGptLogin.vue'
import ProviderIcon from './ProviderIcon.vue'
import { OPENAI_ROOT, PROVIDER_KINDS, providerChoice, providerKind, type ProviderChoice } from './providerKinds'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import type { AssistantModel, AssistantProvider } from '@/lib/api'
import {
  validateBrowserProvider,
  type BrowserProvider,
  type OpenAICompatibleProtocol,
} from '@/lib/assistant/browserProviders'
import { OPENAI_MODELS, modelSuggestions, normalizeModelId } from '@/lib/assistant/modelOptions'
import { errorMessage } from '@/lib/utils'
import { ArrowLeft, ChevronRight, Plus, X } from '@lucide/vue'

const props = defineProps<{ provider?: AssistantProvider | null }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'cancel'): void }>()

const { create, update, check, models: fetchModels, direct } = useAssistantProviders()
const existing = props.provider ? direct(props.provider.provider_id) : null
const existingCompatible = existing?.kind === 'openai_compatible' ? existing : null

const editing = computed(() => Boolean(props.provider))
const choice = ref<ProviderChoice | ''>(props.provider ? providerChoice(props.provider, existing) : '')
const kind = computed(() => (choice.value ? providerKind(choice.value) : null))

const label = ref(props.provider?.label ?? '')
const apiKey = ref('')
const baseUrl = ref(existingCompatible?.baseUrl ?? '')
const protocol = ref<OpenAICompatibleProtocol>(existingCompatible?.protocol ?? 'responses')
const headers = reactive<Array<{ name: string; value: string }>>(
  Object.entries(existingCompatible?.headers ?? {}).map(([name, value]) => ({ name, value })),
)
const headersOpen = ref(false)
const models = ref<AssistantModel[]>(props.provider?.models ?? existing?.models ?? [])
const defaultModel = ref(existing?.model ?? props.provider?.default_model ?? '')
const providerId = ref(props.provider?.provider_id ?? '')
const testedFingerprint = ref('')
const busy = ref(false)
const message = ref<string | null>(null)
const failure = ref<string | null>(null)
const MODEL_LISTING_PLACEHOLDER = '__model_listing__'

const protocolOptions = [
  { value: 'responses', label: 'Responses' },
  { value: 'chat_completions', label: 'Chat Completions' },
] satisfies Array<{ value: OpenAICompatibleProtocol; label: string }>
// Fetched ids are suggestions; any id typed by hand is accepted as well.
const suggestions = computed(() => modelSuggestions(
  { kind: choice.value === 'anthropic' ? 'anthropic' : 'openai_compatible', models: models.value },
  models.value,
))
const keyLabel = computed(() => {
  if (choice.value === 'anthropic') return 'Anthropic API key'
  return choice.value === 'openai' ? 'OpenAI API key' : 'API key (optional)'
})
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
  if (choice.value === 'anthropic') {
    const key = apiKey.value.trim() || (existing?.kind === 'anthropic' ? existing.apiKey : '')
    return { ...common, kind: 'anthropic', apiKey: key }
  }
  const key = apiKey.value.trim() || existingCompatible?.apiKey
  const customHeaders = headerMap()
  return {
    ...common,
    kind: 'openai_compatible',
    baseUrl: choice.value === 'openai' ? OPENAI_ROOT : baseUrl.value.trim(),
    protocol: choice.value === 'openai' ? 'responses' : protocol.value,
    ...(key ? { apiKey: key } : {}),
    ...(customHeaders ? { headers: customHeaders } : {}),
  }
}

// The discovered suggestion list is not part of what the connection test
// covers, so fetching models must not silently disable Save again.
function fingerprint(provider: BrowserProvider): string {
  return JSON.stringify({ ...provider, models: undefined })
}

const testedForCurrent = computed(() => {
  if (!testedFingerprint.value) return false
  return testedFingerprint.value === fingerprint(candidate())
})
const canSave = computed(() => testedForCurrent.value && Boolean(defaultModel.value.trim()) && !busy.value)

function pick(next: ProviderChoice) {
  choice.value = next
  apiKey.value = ''
  defaultModel.value = ''
  models.value = []
  headers.splice(0, headers.length)
  testedFingerprint.value = ''
  message.value = null
  failure.value = null
  baseUrl.value = ''
  protocol.value = 'responses'
}

function back() {
  choice.value = ''
  testedFingerprint.value = ''
  message.value = null
  failure.value = null
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

function offer(listed: AssistantModel[]) {
  models.value = listed
  if (!defaultModel.value && listed.length) defaultModel.value = listed[0].id
}

// An OpenAI key without the model read scope cannot list what the account
// holds; the known ids keep the picker usable instead of leaving it empty.
function offerKnown(): boolean {
  if (choice.value !== 'openai') return false
  offer([...OPENAI_MODELS])
  return true
}

async function loadModels() {
  if (!canFetchModels.value) return
  busy.value = true
  failure.value = null
  message.value = null
  try {
    const listed = await fetchModels(candidate(MODEL_LISTING_PLACEHOLDER, true))
    if (listed.length) {
      offer(listed)
      message.value = `${listed.length} model${listed.length === 1 ? '' : 's'} available.`
      return
    }
    message.value = offerKnown()
      ? 'The account lists no models; the known OpenAI models are offered.'
      : 'This endpoint does not list models; enter the model id manually.'
  } catch (cause) {
    const reason = errorMessage(cause)
    failure.value = offerKnown() ? `${reason} The known OpenAI models are offered instead.` : reason
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
    if (existing) await update(value.id, value)
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
  <div v-if="!kind" class="space-y-3">
    <p class="text-xs text-muted-foreground">Pick what this provider connects to.</p>
    <div class="space-y-2">
      <button
        v-for="option in PROVIDER_KINDS"
        :key="option.id"
        type="button"
        class="flex w-full items-center gap-3.5 rounded-lg border border-border bg-background/60 px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="pick(option.id)"
      >
        <ProviderIcon :choice="option.id" />
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-foreground">{{ option.title }}</span>
          <span class="mt-1 block text-xs leading-relaxed text-muted-foreground">{{ option.summary }}</span>
        </span>
        <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
    <div class="flex justify-end border-t border-border pt-3">
      <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
    </div>
  </div>

  <div v-if="kind" class="space-y-4">
    <div class="flex items-center gap-3">
      <ProviderIcon :choice="kind.id" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-foreground">{{ kind.title }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ kind.summary }}</p>
      </div>
      <Button v-if="!editing" variant="ghost" size="sm" @click="back">
        <ArrowLeft class="size-3.5" /> Change
      </Button>
    </div>

    <template v-if="kind.id === 'chatgpt'">
      <ChatGptLogin @ready="emit('done')" />
      <div class="flex justify-end border-t border-border pt-3">
        <Button variant="ghost" size="sm" @click="emit('cancel')">Close</Button>
      </div>
    </template>

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="text-xs font-medium text-foreground">Display name</label>
          <Input v-model="label" class="mt-1.5" placeholder="Work account" />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">{{ keyLabel }}</label>
          <Input
            v-model="apiKey"
            class="mt-1.5"
            type="password"
            :placeholder="editing
              ? 'Stored in this tab; type to replace'
              : kind.keyRequired ? 'Paste the key' : 'Optional for local endpoints'"
          />
        </div>
        <div v-if="kind.needsBaseUrl">
          <label class="text-xs font-medium text-foreground">API root</label>
          <Input v-model="baseUrl" class="mt-1.5" placeholder="http://localhost:11434/v1" />
        </div>
        <div v-if="kind.needsBaseUrl">
          <label class="text-xs font-medium text-foreground">Protocol</label>
          <Select
            :model-value="protocol"
            :options="protocolOptions"
            class="mt-1.5"
            aria-label="OpenAI protocol"
            @update:model-value="(value) => (protocol = value as OpenAICompatibleProtocol)"
          />
        </div>
        <div class="sm:col-span-2">
          <label class="text-xs font-medium text-foreground">Default model</label>
          <div class="mt-1.5 flex items-center gap-2">
            <ModelCombobox
              v-model="defaultModel"
              :suggestions="suggestions"
              class="h-9 min-w-0 flex-1"
              aria-label="Default model"
              required
              placeholder="Enter a model id"
            />
            <Button variant="outline" :disabled="!canFetchModels || busy" @click="loadModels">Fetch models</Button>
          </div>
        </div>
      </div>

      <div v-if="kind.needsBaseUrl">
        <button
          type="button"
          class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          :aria-expanded="headersOpen"
          @click="headersOpen = !headersOpen"
        >
          <ChevronRight :class="['size-3.5 transition-transform', headersOpen && 'rotate-90']" />
          Custom headers
        </button>
        <div v-if="headersOpen" class="mt-2 space-y-2">
          <div v-for="(header, index) in headers" :key="index" class="flex items-center gap-2">
            <Input v-model="header.name" class="w-48" placeholder="Header" />
            <Input v-model="header.value" class="flex-1" placeholder="Value" type="password" />
            <Button variant="ghost" size="icon-sm" aria-label="Remove header" @click="headers.splice(index, 1)">
              <X class="size-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" @click="headers.push({ name: '', value: '' })">
            <Plus class="size-3.5" /> Add a header
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" :disabled="!canTest || busy" @click="test">Test connection</Button>
        <Spinner v-if="busy" label="Testing the provider" />
        <p v-else-if="!testedForCurrent" class="text-xs text-muted-foreground">
          The key stays in this tab. Save opens once the test passes.
        </p>
      </div>

      <Notice v-if="failure" tone="error">{{ failure }}</Notice>
      <Notice v-else-if="message" tone="success">{{ message }}</Notice>

      <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
        <Button size="sm" :disabled="!canSave" @click="save">{{ busy ? 'Saving…' : 'Save provider' }}</Button>
      </div>
    </template>
  </div>
</template>
