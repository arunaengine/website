<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { computed, ref, useId, watch } from 'vue'
import { Cable, CheckCircle2, Loader2, PlugZap, ShieldAlert, XCircle } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import type { ConnectorCheckResponse, SourceConnectorKind, SourceConnectorSummary } from '@/lib/api'

const props = defineProps<{
  open: boolean
  groupId: string
  connector?: SourceConnectorSummary | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', connector: SourceConnectorSummary): void
}>()

const { createGroupConnector, replaceGroupConnector, checkConnectorConfig, saving } = useAruna()
const { writesDisabled } = useConnectivity()
const uid = useId()

interface FieldSpec {
  key: string
  label: string
  required?: boolean
  placeholder?: string
}

// Mirrors the backend allowlists in aruna operations/src/connectors/
// validation.rs (rules_for_kind). `aruna_native` is rejected by
// validate_connector_input, so it is not offered here.
const KIND_SCHEMAS: Record<
  Exclude<SourceConnectorKind, 'aruna_native'>,
  { label: string; public: FieldSpec[]; secret: FieldSpec[] }
> = {
  http: {
    label: 'HTTP(S)',
    public: [
      { key: 'endpoint', label: 'Endpoint', required: true, placeholder: 'https://data.example.org' },
      { key: 'root', label: 'Root path', placeholder: 'datasets/' },
    ],
    secret: [
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' },
      { key: 'token', label: 'Bearer token' },
    ],
  },
  s3: {
    label: 'S3',
    public: [
      { key: 'endpoint', label: 'Endpoint', required: true, placeholder: 'https://s3.example.org' },
      { key: 'bucket', label: 'Bucket', required: true, placeholder: 'my-bucket' },
      { key: 'region', label: 'Region', placeholder: 'eu-central-1' },
      { key: 'root', label: 'Root prefix', placeholder: 'datasets/' },
    ],
    secret: [
      { key: 'access_key_id', label: 'Access key ID' },
      { key: 'secret_access_key', label: 'Secret access key' },
    ],
  },
  webdav: {
    label: 'WebDAV',
    public: [
      { key: 'endpoint', label: 'Endpoint', required: true, placeholder: 'https://dav.example.org' },
      { key: 'root', label: 'Root path', placeholder: 'shared/data' },
    ],
    secret: [
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' },
      { key: 'token', label: 'Bearer token' },
    ],
  },
  ftp: {
    label: 'FTP',
    public: [
      { key: 'endpoint', label: 'Endpoint', required: true, placeholder: 'ftp://ftp.example.org:21' },
      { key: 'root', label: 'Root path', placeholder: '/pub/data' },
    ],
    secret: [
      { key: 'user', label: 'User' },
      { key: 'password', label: 'Password' },
    ],
  },
}

type EditableKind = keyof typeof KIND_SCHEMAS

const KIND_OPTIONS = (Object.keys(KIND_SCHEMAS) as EditableKind[]).map((kind) => ({
  value: kind,
  label: KIND_SCHEMAS[kind].label,
}))

const name = ref('')
const kind = ref<EditableKind>('http')
// Flat records shared across kinds so overlapping keys (endpoint, root)
// survive a kind switch; the payload only picks the active schema's keys.
const publicValues = ref<Record<string, string>>({})
const secretValues = ref<Record<string, string>>({})
const submitError = ref<string | null>(null)

const isEdit = computed(() => Boolean(props.connector))
const schema = computed(() => KIND_SCHEMAS[kind.value])

const missingRequired = computed(() =>
  schema.value.public.some((field) => field.required && !publicValues.value[field.key]?.trim()),
)
const submitDisabled = computed(
  () => saving.value || writesDisabled.value || !name.value.trim() || missingRequired.value,
)

const secretsEntered = computed(() =>
  schema.value.secret.some((field) => secretValues.value[field.key]?.trim()),
)
// PUT is a full replace: stored secrets cannot be read back, so leaving the
// credential fields blank on an edit removes them.
const secretsWillBeRemoved = computed(
  () => isEdit.value && Boolean(props.connector?.has_secret_config) && !secretsEntered.value,
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const source = props.connector
    name.value = source?.name ?? ''
    kind.value = source && source.kind !== 'aruna_native' ? source.kind : 'http'
    publicValues.value = { ...(source?.public_config ?? {}) }
    secretValues.value = {}
    submitError.value = null
    testResult.value = null
    testError.value = null
  },
)

function pick(spec: FieldSpec[], values: Record<string, string>): Record<string, string> {
  const config: Record<string, string> = {}
  for (const field of spec) {
    const value = values[field.key]?.trim()
    if (value) config[field.key] = value
  }
  return config
}

function requestBody() {
  return {
    name: name.value.trim() || 'connection-test',
    kind: kind.value,
    public_config: pick(schema.value.public, publicValues.value),
    secret_config: pick(schema.value.secret, secretValues.value),
  }
}

// "Test connection" runs the inline-config check BEFORE anything is saved
// (agreed contract: POST /groups/{gid}/connectors/check with the current form
// values, secrets included). Older nodes without the endpoint hide the button.
const testing = ref(false)
const testResult = ref<ConnectorCheckResponse | null>(null)
const testError = ref<string | null>(null)
const testUnsupported = ref(false)

async function testConnection() {
  if (testing.value || missingRequired.value) return
  testing.value = true
  testResult.value = null
  testError.value = null
  try {
    testResult.value = await checkConnectorConfig(props.groupId, requestBody())
  } catch (err) {
    if (isUnsupportedEndpoint(err)) {
      testUnsupported.value = true
    } else {
      testError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    testing.value = false
  }
}

// A stale verdict is worse than none: editing any field clears the result.
watch([kind, publicValues, secretValues], () => {
  testResult.value = null
  testError.value = null
}, { deep: true })

async function submit() {
  if (submitDisabled.value) return
  submitError.value = null
  const body = requestBody()
  body.name = name.value.trim()
  try {
    const saved = props.connector
      ? await replaceGroupConnector(props.groupId, props.connector.connector_id, body)
      : await createGroupConnector(props.groupId, body)
    emit('saved', saved)
    emit('update:open', false)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Cable class="h-4 w-4 text-primary" />
          {{ isEdit ? 'Edit source connector' : 'Register source connector' }}
        </DialogTitle>
        <DialogDescription>
          The node pulls data from this source when you ingest it into a bucket.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-3" @submit.prevent="submit">
        <div class="max-h-[65vh] space-y-3 overflow-y-auto px-1 scrollbar-thin">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :for="`${uid}-name`" class="text-xs font-medium text-foreground">Name</label>
              <Input :id="`${uid}-name`" v-model="name" class="mt-1" placeholder="reference-data" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Kind</label>
              <Select
                :model-value="kind"
                :options="KIND_OPTIONS"
                aria-label="Kind"
                class="mt-1"
                @update:model-value="(v: string) => (kind = v as EditableKind)"
              />
            </div>
          </div>

          <div v-for="field in schema.public" :key="field.key">
            <label :for="`${uid}-pub-${field.key}`" class="text-xs font-medium text-foreground">
              {{ field.label }}<span v-if="!field.required" class="text-muted-foreground"> (optional)</span>
            </label>
            <Input
              :id="`${uid}-pub-${field.key}`"
              :model-value="publicValues[field.key] ?? ''"
              class="mt-1 font-mono text-xs"
              :placeholder="field.placeholder"
              :required="field.required"
              @update:model-value="(v: string | number) => (publicValues[field.key] = String(v))"
            />
          </div>

          <fieldset class="space-y-3 rounded-md border border-border p-3">
            <legend class="px-1 text-xs font-semibold text-foreground">Credentials (optional)</legend>
            <p class="text-[11px] text-muted-foreground">
              Stored write-only — the server never returns them.
            </p>
            <div v-for="field in schema.secret" :key="field.key">
              <label :for="`${uid}-sec-${field.key}`" class="text-xs font-medium text-foreground">{{ field.label }}</label>
              <Input
                :id="`${uid}-sec-${field.key}`"
                :model-value="secretValues[field.key] ?? ''"
                type="password"
                autocomplete="new-password"
                class="mt-1 font-mono text-xs"
                @update:model-value="(v: string | number) => (secretValues[field.key] = String(v))"
              />
            </div>
            <div
              v-if="secretsWillBeRemoved"
              class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
            >
              <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This connector has stored credentials that cannot be shown. Saving replaces the whole
                secret configuration — leave the fields blank to remove them, or re-enter values to keep
                credentials on the connector.
              </span>
            </div>
          </fieldset>

          <!-- Inline-config connection test result (before saving). -->
          <p
            v-if="testResult && testResult.ok"
            class="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
            Connection OK{{ testResult.latency_ms !== undefined ? ` — ${testResult.latency_ms} ms` : '' }}.
          </p>
          <p
            v-else-if="testResult"
            class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <XCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Connection failed{{ testResult.error ? `: ${testResult.error}` : '.' }}</span>
          </p>
          <p v-else-if="testError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Connection test failed: {{ testError }}
          </p>
          <p v-if="testUnsupported" class="text-[11px] text-muted-foreground">
            Connection tests are not supported by this node yet.
          </p>

          <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {{ submitError }}
          </p>
          <div v-if="writesDisabled" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            You're offline — saving a connector needs connectivity.
          </div>
        </div>

        <DialogFooter class="sm:justify-between">
          <Button
            v-if="!testUnsupported"
            type="button"
            variant="outline"
            :disabled="testing || missingRequired || writesDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Checks the connection with these settings before saving'"
            @click="testConnection"
          >
            <Loader2 v-if="testing" class="h-3.5 w-3.5 animate-spin" />
            <PlugZap v-else class="h-3.5 w-3.5" />
            {{ testing ? 'Testing…' : 'Test connection' }}
          </Button>
          <span v-else />
          <div class="flex items-center gap-2">
            <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" :disabled="submitDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined">
              {{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Register connector' }}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
