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
import Switch from '@/components/ui/Switch.vue'
import { computed, ref, useId, watch } from 'vue'
import { Database, Lock } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { BACKEND_KINDS, BACKEND_KIND_SCHEMAS, backendSchema } from '@/lib/storage'
import type { GroupBackendKind, GroupBackendResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import Notice from '@/components/ui/Notice.vue'

const props = defineProps<{
  open: boolean
  groupId: string
  backend?: GroupBackendResponse | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', backend: GroupBackendResponse): void
}>()

const { createGroupBackend, replaceGroupBackend, saving } = useAruna()
const { writesDisabled } = useConnectivity()
const uid = useId()

const KIND_OPTIONS = BACKEND_KINDS.map((kind) => ({ value: kind, label: BACKEND_KIND_SCHEMAS[kind].label }))

const name = ref('')
const kind = ref<GroupBackendKind>('s3')
const publicValues = ref<Record<string, string>>({})
const secretValues = ref<Record<string, string>>({})
const toggleOn = ref(false)
const submitError = ref<string | null>(null)

const isEdit = computed(() => Boolean(props.backend))
const schema = computed(() => BACKEND_KIND_SCHEMAS[kind.value])
// The keys naming the store cannot change: every stored object is stamped with
// this backend, so repointing it would make that data unreadable.
const fixed = computed(() => (isEdit.value ? new Set(schema.value.identity) : new Set<string>()))
// A disabled backend refuses a settings change, but its credentials may still
// be replaced so a leaked key can be invalidated.
const settingsLocked = computed(() => Boolean(props.backend?.disabled))

const credentialsEntered = computed(() =>
  schema.value.secret.some((field) => Boolean(secretValues.value[field.key]?.trim())),
)
const credentialsIncomplete = computed(() => {
  const spec = schema.value
  const filled = (key: string) => Boolean(secretValues.value[key]?.trim())
  if (spec.secretOneOf) return !spec.secretOneOf.some(filled)
  return spec.secret.some((field) => field.required && !filled(field.key))
})

const settingsChanged = computed(() => {
  const source = props.backend
  if (!source) return true
  if (name.value.trim() !== source.name) return true
  const toggle = schema.value.toggle
  if (toggle && (source.public_config[toggle.key] === 'true') !== toggleOn.value) return true
  return schema.value.public.some(
    (field) => (publicValues.value[field.key]?.trim() ?? '') !== (source.public_config[field.key] ?? ''),
  )
})

const missingRequired = computed(() =>
  schema.value.public.some((field) => field.required && !publicValues.value[field.key]?.trim()),
)

// Editing settings goes through a full replace, which always rewrites the
// credentials, so they have to be entered again.
const needsCredentials = computed(() => !isEdit.value || settingsChanged.value)

const submitDisabled = computed(() => {
  if (saving.value || writesDisabled.value) return true
  // Nothing typed and nothing changed: there is nothing to save.
  if (isEdit.value && !settingsChanged.value && !credentialsEntered.value) return true
  if (needsCredentials.value && (missingRequired.value || !name.value.trim())) return true
  return credentialsIncomplete.value
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const source = props.backend
    name.value = source?.name ?? ''
    const known = source ? backendSchema(source.kind) : null
    kind.value = known && source ? (source.kind as GroupBackendKind) : 's3'
    publicValues.value = { ...(source?.public_config ?? {}) }
    secretValues.value = {}
    const toggleKey = BACKEND_KIND_SCHEMAS[kind.value].toggle?.key
    toggleOn.value = toggleKey !== undefined && source?.public_config[toggleKey] === 'true'
    submitError.value = null
  },
)

function credentials(): Record<string, string> {
  const config: Record<string, string> = {}
  for (const field of schema.value.secret) {
    const value = secretValues.value[field.key]?.trim()
    if (value) config[field.key] = value
  }
  return config
}

function fullBody() {
  const publicConfig: Record<string, string> = {}
  for (const field of schema.value.public) {
    const value = publicValues.value[field.key]?.trim()
    if (value) publicConfig[field.key] = value
  }
  const toggle = schema.value.toggle
  if (toggle && toggleOn.value) publicConfig[toggle.key] = 'true'
  return {
    name: name.value.trim(),
    kind: kind.value,
    public_config: publicConfig,
    secret_config: credentials(),
  }
}

async function submit() {
  if (submitDisabled.value) return
  submitError.value = null
  const existing = props.backend
  try {
    let saved: GroupBackendResponse
    if (existing) {
      saved = await replaceGroupBackend(props.groupId, existing.backend_id, fullBody())
    } else {
      saved = await createGroupBackend(props.groupId, fullBody())
    }
    emit('saved', saved)
    emit('update:open', false)
  } catch (err) {
    submitError.value = errorMessage(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Database class="h-4 w-4 text-primary" />
          {{ isEdit ? 'Edit storage backend' : 'Add storage backend' }}
        </DialogTitle>
        <DialogDescription>
          New uploads that pick this backend are written to storage your group runs, not to this
          node's own storage.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-3" @submit.prevent="submit">
        <div class="max-h-[65vh] space-y-3 overflow-y-auto px-1 scrollbar-thin">
          <p
            v-if="settingsLocked"
            class="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            This backend is disabled. You can still change its credentials; other settings can only
            change after you enable it again.
          </p>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :for="`${uid}-name`" class="text-xs font-medium text-foreground">Name</label>
              <Input
                :id="`${uid}-name`"
                v-model="name"
                class="mt-1"
                placeholder="lab-object-store"
                :disabled="settingsLocked"
              />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Type</label>
              <Select
                :model-value="kind"
                :options="KIND_OPTIONS"
                :disabled="isEdit"
                aria-label="Type"
                class="mt-1"
                @update:model-value="(v: string) => (kind = v as GroupBackendKind)"
              />
            </div>
          </div>

          <p v-if="isEdit" class="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Lock
              class="mt-0.5 h-3 w-3 shrink-0"
              aria-label="Locked"
              title="Files already stored here are recorded against this type and address; pointing the entry elsewhere would make them unreadable."
            />
            <span>The type and the address cannot change. Add a second backend instead.</span>
          </p>

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
              :disabled="fixed.has(field.key) || settingsLocked"
              @update:model-value="(v: string | number) => (publicValues[field.key] = String(v))"
            />
          </div>

          <label v-if="schema.toggle" class="flex items-center justify-between gap-3 text-xs">
            <span>
              <span class="font-medium text-foreground">{{ schema.toggle.label }}</span>
              <span class="block text-[11px] text-muted-foreground">{{ schema.toggle.hint }}</span>
            </span>
            <Switch
              :checked="toggleOn"
              :disabled="settingsLocked"
              :aria-label="schema.toggle.label"
              @update:checked="(v: boolean) => (toggleOn = v)"
            />
          </label>

          <fieldset class="space-y-3 rounded-md border border-border p-3">
            <legend class="px-1 text-xs font-semibold text-foreground">Credentials</legend>
            <p class="text-[11px] text-muted-foreground">
              Stored write-only: the node never shows them again.
              <template v-if="schema.secretOneOf">One of the two is enough.</template>
              <template v-if="isEdit && !settingsChanged"> Leave blank to keep the current ones.</template>
              <template v-else-if="isEdit"> Changing the settings above rewrites them, so enter them again.</template>
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
          </fieldset>

          <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
          <p class="text-[11px] text-muted-foreground">
            The node tries the credentials against the backend before it saves them.
          </p>
        </div>

        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="submitDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined">
            {{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add backend' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
