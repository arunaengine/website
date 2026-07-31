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
import { computed, ref, useId, watch } from 'vue'
import { KeyRound } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { backendSchema } from '@/lib/storage'
import type { GroupBackendResponse } from '@/lib/api'

const props = defineProps<{
  open: boolean
  groupId: string
  backend: GroupBackendResponse | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'rotated'): void
  /** The node has no credentials route; the caller hides the affordance. */
  (e: 'unsupported'): void
}>()

const { rotateBackendSecret, saving } = useAruna()
const { writesDisabled } = useConnectivity()
const uid = useId()

const values = ref<Record<string, string>>({})
const rotateError = ref<string | null>(null)

const schema = computed(() => (props.backend ? backendSchema(props.backend.kind) : null))
const missing = computed(() => {
  const spec = schema.value
  if (!spec) return true
  const filled = (key: string) => Boolean(values.value[key]?.trim())
  if (spec.secretOneOf) return !spec.secretOneOf.some(filled)
  return spec.secret.some((field) => field.required && !filled(field.key))
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    values.value = {}
    rotateError.value = null
  },
)

async function submit() {
  const spec = schema.value
  if (!props.backend || !spec || missing.value || saving.value || writesDisabled.value) return
  rotateError.value = null
  const secret: Record<string, string> = {}
  for (const field of spec.secret) {
    const value = values.value[field.key]?.trim()
    if (value) secret[field.key] = value
  }
  try {
    await rotateBackendSecret(props.groupId, props.backend.backend_id, { secret_config: secret })
    emit('rotated')
    emit('update:open', false)
  } catch (err) {
    if (isUnsupportedEndpoint(err)) {
      emit('unsupported')
      emit('update:open', false)
      return
    }
    rotateError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <KeyRound class="h-4 w-4 text-primary" /> Rotate credentials
        </DialogTitle>
        <DialogDescription>
          Replaces the stored credentials of <span class="font-mono">{{ props.backend?.name }}</span>
          without touching where it points. Works on a retired backend too, so a leaked key can
          always be invalidated.
        </DialogDescription>
      </DialogHeader>

      <form v-if="schema" class="space-y-3" @submit.prevent="submit">
        <p class="text-[11px] text-muted-foreground">
          The node verifies the new credentials against the store before storing them.
          <template v-if="schema.secretOneOf">One of the two is required.</template>
        </p>
        <div v-for="field in schema.secret" :key="field.key">
          <label :for="`${uid}-${field.key}`" class="text-xs font-medium text-foreground">{{ field.label }}</label>
          <Input
            :id="`${uid}-${field.key}`"
            :model-value="values[field.key] ?? ''"
            type="password"
            autocomplete="new-password"
            class="mt-1 font-mono text-xs"
            @update:model-value="(v: string | number) => (values[field.key] = String(v))"
          />
        </div>
        <p v-if="rotateError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {{ rotateError }}
        </p>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button
            type="submit"
            :disabled="missing || saving || writesDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          >
            {{ saving ? 'Rotating…' : 'Rotate credentials' }}
          </Button>
        </DialogFooter>
      </form>
      <p v-else class="text-xs text-muted-foreground">
        This portal does not know the credential fields of backend kind
        <span class="font-mono">{{ props.backend?.kind }}</span>.
      </p>
    </DialogContent>
  </Dialog>
</template>
