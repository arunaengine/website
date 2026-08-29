<script setup lang="ts">
// Add or edit one AI provider. The key never leaves the node once stored, so
// it is never read back into this form: an empty key field on an existing
// provider means "keep the stored one". Testing the connection creates the
// record, because the node's test route needs a provider to test.
import { computed, reactive, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import ModelCombobox from '@/components/assistant/ModelCombobox.vue'
import { useAssistantProviders } from '@/composables/useAssistantProviders'
import {
  ADDABLE_PROVIDER_KINDS,
  PROVIDER_KIND_LABELS,
  type AssistantModel,
  type AssistantProvider,
  type AssistantProviderKind,
} from '@/lib/api'
import { modelSuggestions, normalizeModelId } from '@/lib/assistant/modelOptions'
import { errorMessage } from '@/lib/utils'
import { ChevronRight, Plus, X } from '@lucide/vue'

const props = defineProps<{ provider?: AssistantProvider | null }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'cancel'): void }>()

const { create, update, check, models: fetchModels } = useAssistantProviders()

const editing = computed(() => Boolean(props.provider))
const kind = ref<AssistantProviderKind>(props.provider?.kind ?? 'anthropic')
const label = ref(props.provider?.label ?? '')
const apiKey = ref('')
const baseUrl = ref(props.provider?.base_url ?? '')
const headers = reactive<Array<{ name: string; value: string }>>([])
const headersOpen = ref(false)
const models = ref<AssistantModel[]>(props.provider?.models ?? [])
const defaultModel = ref(props.provider?.default_model ?? '')

// The record the node holds for this form; set once Test created it.
const providerId = ref(props.provider?.provider_id ?? '')
const tested = ref(Boolean(props.provider))
const busy = ref(false)
const message = ref<string | null>(null)
const failure = ref<string | null>(null)

const kindOptions = ADDABLE_PROVIDER_KINDS.map((entry) => ({ value: entry, label: PROVIDER_KIND_LABELS[entry] }))
// Fetched ids are suggestions; any id typed by hand is accepted as well.
const suggestions = computed(() =>
  modelSuggestions({ kind: kind.value, models: props.provider?.models ?? [] }, models.value))
const needsBaseUrl = computed(() => kind.value === 'openai_compatible')
const canTest = computed(() =>
  Boolean(label.value.trim())
  && (!needsBaseUrl.value || Boolean(baseUrl.value.trim()))
  && (editing.value || Boolean(apiKey.value.trim())))
const canSave = computed(() => tested.value && Boolean(label.value.trim()) && !busy.value)

function headerMap(): Record<string, string> | undefined {
  const entries = headers.filter((header) => header.name.trim())
  if (!entries.length) return undefined
  return Object.fromEntries(entries.map((header) => [header.name.trim(), header.value]))
}

// The stored key is never echoed back, so it is sent only when retyped.
function changedFields() {
  return {
    label: label.value.trim(),
    ...(apiKey.value.trim() ? { api_key: apiKey.value.trim() } : {}),
    ...(needsBaseUrl.value ? { base_url: baseUrl.value.trim() } : {}),
    ...(headerMap() ? { headers: headerMap() } : {}),
  }
}

async function persist(): Promise<string> {
  if (providerId.value) {
    await update(providerId.value, changedFields())
    return providerId.value
  }
  const created = await create({ kind: kind.value, ...changedFields() })
  providerId.value = created.provider_id
  return created.provider_id
}

async function test() {
  busy.value = true
  message.value = null
  failure.value = null
  try {
    const id = await persist()
    const result = await check(id)
    tested.value = result.ok
    if (result.ok) message.value = result.message || 'The provider answered.'
    else failure.value = result.message || 'The provider refused the credentials.'
    // A retyped key that passed is stored; clear it so it is not re-sent.
    if (result.ok) apiKey.value = ''
  } catch (cause) {
    tested.value = false
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function loadModels() {
  busy.value = true
  failure.value = null
  try {
    const id = await persist()
    models.value = await fetchModels(id)
    if (!defaultModel.value && models.value.length) defaultModel.value = models.value[0].id
    if (!models.value.length) failure.value = 'The provider listed no text models.'
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function save() {
  busy.value = true
  failure.value = null
  try {
    const id = await persist()
    const chosen = normalizeModelId(defaultModel.value)
    await update(id, {
      ...(models.value.length ? { models: models.value } : {}),
      ...(chosen ? { default_model: chosen } : {}),
    })
    emit('done')
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

// Changing the credential invalidates the last passing test.
function keyChanged() {
  if (apiKey.value.trim()) tested.value = false
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
          @update:model-value="(value) => (kind = value as AssistantProviderKind)"
        />
        <p v-else class="mt-2 text-sm text-foreground">{{ PROVIDER_KIND_LABELS[kind] }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Display name</label>
        <Input v-model="label" class="mt-1" placeholder="Work account" />
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">API key</label>
        <Input
          v-model="apiKey"
          class="mt-1"
          type="password"
          :placeholder="editing ? 'Stored on the node, type to replace' : 'Paste the provider key'"
          @update:model-value="keyChanged"
        />
        <p class="mt-1 text-[11px] text-muted-foreground">
          Sealed on the node and never sent back to this browser.
        </p>
      </div>
      <div v-if="needsBaseUrl">
        <label class="text-xs font-medium text-foreground">Base URL</label>
        <Input v-model="baseUrl" class="mt-1" placeholder="https://api.example.org/v1" />
        <p class="mt-1 text-[11px] text-muted-foreground">
          On a desktop node a loopback URL works, for example Ollama on http://127.0.0.1:11434. The node makes the
          request, so Ollama needs no OLLAMA_ORIGINS change.
        </p>
      </div>
    </div>

    <div>
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
        <p class="text-[11px] text-muted-foreground">Rarely needed. Values are sealed on the node like the key.</p>
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
      <Button variant="outline" size="sm" :disabled="!tested || busy" @click="loadModels">Fetch models</Button>
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-foreground">Default model</label>
        <ModelCombobox
          v-model="defaultModel"
          :suggestions="suggestions"
          class="h-8 w-64"
          aria-label="Default model"
          placeholder="Pick a fetched model or type an id"
        />
      </div>
    </div>

    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <Notice v-else-if="message" tone="success">{{ message }}</Notice>
    <p v-else-if="!tested" class="text-[11px] text-muted-foreground">
      Test the connection before saving, so a provider is only stored once it answers.
    </p>

    <div class="flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
      <Button size="sm" :disabled="!canSave" @click="save">{{ busy ? 'Saving…' : 'Save provider' }}</Button>
    </div>
  </div>
</template>
