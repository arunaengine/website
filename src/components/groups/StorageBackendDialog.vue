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
import { Database, ShieldAlert } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { BACKEND_KINDS, BACKEND_KIND_SCHEMAS, backendSchema } from '@/lib/storage'
import type { GroupBackendKind, GroupBackendResponse } from '@/lib/api'

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
// Kind and the keys naming the physical store are fixed after create: changing
// one would silently redirect every object already stamped with this backend.
const locked = computed(() => (isEdit.value ? new Set(schema.value.identity) : new Set<string>()))

const missingPublic = computed(() =>
  schema.value.public.some((field) => field.required && !publicValues.value[field.key]?.trim()),
)
const missingSecret = computed(() => {
  const spec = schema.value
  const filled = (key: string) => Boolean(secretValues.value[key]?.trim())
  if (spec.secretOneOf) return !spec.secretOneOf.some(filled)
  return spec.secret.some((field) => field.required && !filled(field.key))
})
const submitDisabled = computed(
  () =>
    saving.value ||
    writesDisabled.value ||
    !name.value.trim() ||
    missingPublic.value ||
    missingSecret.value,
)

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

function pick(keys: { key: string }[], values: Record<string, string>): Record<string, string> {
  const config: Record<string, string> = {}
  for (const field of keys) {
    const value = values[field.key]?.trim()
    if (value) config[field.key] = value
  }
  return config
}

async function submit() {
  if (submitDisabled.value) return
  submitError.value = null
  const publicConfig = pick(schema.value.public, publicValues.value)
  const toggle = schema.value.toggle
  if (toggle && toggleOn.value) publicConfig[toggle.key] = 'true'
  const body = {
    name: name.value.trim(),
    kind: kind.value,
    public_config: publicConfig,
    secret_config: pick(schema.value.secret, secretValues.value),
  }
  try {
    const saved = props.backend
      ? await replaceGroupBackend(props.groupId, props.backend.backend_id, body)
      : await createGroupBackend(props.groupId, body)
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
          <Database class="h-4 w-4 text-primary" />
          {{ isEdit ? 'Replace storage backend' : 'Register storage backend' }}
        </DialogTitle>
        <DialogDescription>
          Objects routed to this backend are written to storage your group operates, not to the
          node's own storage.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-3" @submit.prevent="submit">
        <div class="max-h-[65vh] space-y-3 overflow-y-auto px-1 scrollbar-thin">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :for="`${uid}-name`" class="text-xs font-medium text-foreground">Name</label>
              <Input :id="`${uid}-name`" v-model="name" class="mt-1" placeholder="lab-object-store" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Kind</label>
              <Select
                :model-value="kind"
                :options="KIND_OPTIONS"
                :disabled="isEdit"
                aria-label="Kind"
                class="mt-1"
                @update:model-value="(v: string) => (kind = v as GroupBackendKind)"
              />
            </div>
          </div>

          <div v-for="field in schema.public" :key="field.key">
            <label :for="`${uid}-pub-${field.key}`" class="text-xs font-medium text-foreground">
              {{ field.label }}<span v-if="!field.required" class="text-muted-foreground"> (optional)</span>
              <span v-if="locked.has(field.key)" class="text-muted-foreground"> · fixed after registration</span>
            </label>
            <Input
              :id="`${uid}-pub-${field.key}`"
              :model-value="publicValues[field.key] ?? ''"
              class="mt-1 font-mono text-xs"
              :placeholder="field.placeholder"
              :required="field.required"
              :disabled="locked.has(field.key)"
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
              :aria-label="schema.toggle.label"
              @update:checked="(v: boolean) => (toggleOn = v)"
            />
          </label>

          <fieldset class="space-y-3 rounded-md border border-border p-3">
            <legend class="px-1 text-xs font-semibold text-foreground">Credentials</legend>
            <p class="text-[11px] text-muted-foreground">
              Stored write-only, the server never returns them.
              <template v-if="schema.secretOneOf">One of the two is required.</template>
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
              v-if="isEdit"
              class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
            >
              <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Stored credentials cannot be shown. Saving replaces them, so enter them again. To
                change only the credentials, use "Rotate credentials" instead.
              </span>
            </div>
          </fieldset>

          <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {{ submitError }}
          </p>
          <p class="text-[11px] text-muted-foreground">
            The node verifies the credentials against the store before it registers the backend.
          </p>
        </div>

        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="submitDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined">
            {{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Register backend' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
