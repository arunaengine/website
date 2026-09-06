<script setup lang="ts">
// Add or edit one provider in two steps: pick the kind, then fill only what
// that kind needs. A browser key stays in this browser session or goes to the
// node sealed with the user's passphrase; saving tests the connection first.
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import ChatGptLogin from './ChatGptLogin.vue'
import ProviderIcon from './ProviderIcon.vue'
import { OPENAI_ROOT, PROVIDER_KINDS, providerChoice, providerKind, type ProviderChoice } from './providerKinds'
import { useAssistantProviders, type ProviderStorage } from '@/composables/useAssistantProviders'
import { useUserVault } from '@/composables/useUserVault'
import type { AssistantModel, AssistantProvider } from '@/lib/api'
import {
  validateBrowserProvider,
  type BrowserProvider,
  type OpenAICompatibleProtocol,
  type WebSearchChoice,
} from '@/lib/assistant/browserProviders'
import { OPENAI_MODELS, modelSuggestions, normalizeModelId } from '@/lib/assistant/modelOptions'
import { errorMessage } from '@/lib/utils'
import { ArrowLeft, ChevronRight, Plus, X } from '@lucide/vue'

const props = defineProps<{ provider?: AssistantProvider | null }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'cancel'): void }>()

const { create, update, check, models: fetchModels, direct, storageOf } = useAssistantProviders()
const { state: vaultState } = useUserVault()
const existing = props.provider ? direct(props.provider.provider_id) : null
const existingCompatible = existing?.kind === 'openai_compatible' ? existing : null
// Once keys exist on the node, a new key goes there too unless the user says otherwise.
const existingStorage = props.provider ? storageOf(props.provider.provider_id) : null
const storage = ref<ProviderStorage>(
  existingStorage ?? (vaultState.value === 'locked' || vaultState.value === 'unlocked' ? 'node' : 'session'),
)
const storageOptions = [
  {
    value: 'session',
    label: 'This browser session',
    help: 'The key is gone when you sign out or close the browser, and never reaches the node.',
  },
  {
    value: 'node',
    label: 'On this node, sealed with my passphrase',
    help: 'The key is sealed with your passphrase before it reaches the node, and follows you to other browsers.',
  },
] satisfies Array<{ value: ProviderStorage; label: string; help: string }>
const storageChoice = computed(() => vaultState.value !== 'unsupported')
// Keys go to the node only while they are unlocked there; the keys tab creates or unlocks them.
const nodeReady = computed(() => vaultState.value === 'unlocked')
const storageReady = computed(() => storage.value === 'session' || nodeReady.value)
const nodeNote = computed(() => (vaultState.value === 'locked'
  ? 'Your keys on this node are locked.'
  : 'There is no passphrase for keys on this node yet.'))

const editing = computed(() => Boolean(props.provider))
const choice = ref<ProviderChoice | ''>(props.provider ? providerChoice(props.provider, existing) : '')
const kind = computed(() => (choice.value ? providerKind(choice.value) : null))

const label = ref(props.provider?.label ?? '')
const apiKey = ref('')
const baseUrl = ref(existingCompatible?.baseUrl ?? '')
const protocol = ref<OpenAICompatibleProtocol>(existingCompatible?.protocol ?? 'responses')
const webSearch = ref<WebSearchChoice | ''>(existingCompatible?.webSearch ?? '')
const headers = reactive<Array<{ name: string; value: string }>>(
  Object.entries(existingCompatible?.headers ?? {}).map(([name, value]) => ({ name, value })),
)
const headersOpen = ref(false)
const models = ref<AssistantModel[]>(props.provider?.models ?? existing?.models ?? [])
const defaultModel = ref(existing?.model ?? props.provider?.default_model ?? '')
const providerId = ref(props.provider?.provider_id ?? '')
const busy = ref<'test' | 'save' | 'models' | null>(null)
const message = ref<string | null>(null)
const failure = ref<string | null>(null)
const MODEL_LISTING_PLACEHOLDER = '__model_listing__'

const protocolOptions = [
  { value: 'responses', label: 'Responses' },
  { value: 'chat_completions', label: 'Chat Completions' },
] satisfies Array<{ value: OpenAICompatibleProtocol; label: string }>
// What the endpoint reports per model decides by default; a choice here wins over it.
const searchChoices = [
  { value: '', label: 'As the model reports' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] satisfies Array<{ value: WebSearchChoice | ''; label: string }>
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
    ...(webSearch.value ? { webSearch: webSearch.value } : {}),
  }
}

const canSave = computed(() => canTest.value && storageReady.value && !busy.value)

function pick(next: ProviderChoice) {
  choice.value = next
  apiKey.value = ''
  defaultModel.value = ''
  models.value = []
  headers.splice(0, headers.length)
  message.value = null
  failure.value = null
  baseUrl.value = ''
  protocol.value = 'responses'
  webSearch.value = ''
}

function back() {
  choice.value = ''
  message.value = null
  failure.value = null
}

/** The connection check alone; true when the provider accepted the candidate. */
async function checked(value: BrowserProvider): Promise<boolean> {
  try {
    const result = await check(value)
    if (result.ok) return true
    failure.value = result.message || 'The provider refused the credentials.'
  } catch (cause) {
    failure.value = errorMessage(cause)
  }
  return false
}

async function test() {
  if (!canTest.value || busy.value) return
  busy.value = 'test'
  message.value = null
  failure.value = null
  try {
    if (await checked(candidate())) message.value = 'The provider answered.'
  } finally {
    busy.value = null
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
  if (!canFetchModels.value || busy.value) return
  busy.value = 'models'
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
    busy.value = null
  }
}

// The connection is tested first; a refusal keeps the form open with the reason.
async function save() {
  if (!canSave.value) return
  busy.value = 'save'
  failure.value = null
  message.value = null
  try {
    const value = candidate()
    if (!(await checked(value))) return
    if (existing) await update(value.id, value, storage.value)
    else await create(value, storage.value)
    emit('done')
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = null
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
      <div class="space-y-4">
        <div>
          <label class="text-xs font-medium text-foreground" for="provider-label">Display name</label>
          <Input id="provider-label" v-model="label" class="mt-1.5" placeholder="Work account" />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground" for="provider-key">{{ keyLabel }}</label>
          <Input
            id="provider-key"
            v-model="apiKey"
            class="mt-1.5"
            type="password"
            :placeholder="editing
              ? 'Saved; type to replace'
              : kind.keyRequired ? 'Paste the key' : 'Optional for local endpoints'"
          />
        </div>
        <div v-if="kind.needsBaseUrl">
          <label class="text-xs font-medium text-foreground" for="provider-root">API root</label>
          <Input id="provider-root" v-model="baseUrl" class="mt-1.5" placeholder="http://localhost:11434/v1" />
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
        <div>
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
            <Button variant="outline" :disabled="!canFetchModels || Boolean(busy)" @click="loadModels">Fetch models</Button>
          </div>
        </div>
        <div v-if="kind.needsBaseUrl">
          <label class="text-xs font-medium text-foreground">Web search</label>
          <Select
            :model-value="webSearch"
            :options="searchChoices"
            class="mt-1.5"
            aria-label="Web search"
            @update:model-value="(value) => (webSearch = value as WebSearchChoice | '')"
          />
          <p class="mt-1.5 text-xs text-muted-foreground">
            Whether the endpoint runs a web search for the model. Leave it to the model unless you know better.
          </p>
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

        <fieldset v-if="storageChoice" class="space-y-2">
          <legend class="text-xs font-medium text-foreground">Keep the key</legend>
          <label
            v-for="option in storageOptions"
            :key="option.value"
            class="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors"
            :class="storage === option.value ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-muted/30'"
          >
            <input
              type="radio"
              name="provider-key-storage"
              :value="option.value"
              :checked="storage === option.value"
              :disabled="option.value === 'node' && !nodeReady"
              class="mt-1 accent-primary"
              @change="storage = option.value"
            >
            <span class="min-w-0">
              <span class="block text-sm text-foreground">{{ option.label }}</span>
              <span class="mt-0.5 block text-xs text-muted-foreground">{{ option.help }}</span>
              <span v-if="option.value === 'node' && !nodeReady" class="mt-1 block text-xs text-muted-foreground">
                {{ nodeNote }}
                <RouterLink :to="{ name: 'settings', query: { tab: 'keys' } }" class="text-primary hover:underline">
                  Open Settings, Provider keys
                </RouterLink>
              </span>
            </span>
          </label>
        </fieldset>

        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
        <Notice v-else-if="message" tone="success">{{ message }}</Notice>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Spinner v-if="busy === 'test'" label="Testing the connection" show-label class="mr-auto" />
        <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
        <Button variant="outline" size="sm" :disabled="!canTest || Boolean(busy)" @click="test">Test only</Button>
        <Button size="sm" :disabled="!canSave" @click="save">
          {{ busy === 'save' ? 'Testing and saving…' : editing ? 'Save' : 'Add provider' }}
        </Button>
      </div>
    </template>
  </div>
</template>
