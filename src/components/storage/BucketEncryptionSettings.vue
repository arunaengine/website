<script setup lang="ts">
// Group-admin controls: the encryption mode and format of new writes, the
// longest unlock, and key rotation. Each change is confirmed with its notes.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import type { BlockCipher, BlockKeys, BucketEncryptionResponse, EncryptionMode } from '@/lib/api'
import {
  BLOCK_KEYS_LABEL,
  CIPHER_LABEL,
  MODE_LABEL,
  ROTATION_NOTES,
  changeNeedsUnlock,
  changeNotes,
  encryptionError,
  maxUnlockOptions,
  type EncryptionDraft,
} from '@/lib/bucketEncryption'

const props = defineProps<{
  status: BucketEncryptionResponse
  busy: boolean
  save: (request: EncryptionDraft & { expected_generation: number }) => Promise<unknown>
  rotate: () => Promise<unknown>
}>()

const mode = ref<EncryptionMode>('off')
const cipher = ref<BlockCipher>('chacha20_poly1305')
const blockKeys = ref<BlockKeys>('content_derived')
const maxUnlock = ref('')
const confirming = ref<'save' | 'rotate' | null>(null)
const failure = ref<string | null>(null)

function reset() {
  mode.value = props.status.mode
  cipher.value = props.status.cipher
  blockKeys.value = props.status.block_keys
  maxUnlock.value = props.status.max_unlock_ms === null ? '' : String(props.status.max_unlock_ms)
}
watch(() => props.status, reset, { immediate: true })

const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const draft = computed<EncryptionDraft>(() => ({
  mode: mode.value,
  cipher: cipher.value,
  block_keys: blockKeys.value,
  max_unlock_ms: maxUnlock.value ? Number(maxUnlock.value) : null,
}))
const changed = computed(
  () =>
    draft.value.mode !== props.status.mode ||
    draft.value.cipher !== props.status.cipher ||
    draft.value.block_keys !== props.status.block_keys ||
    draft.value.max_unlock_ms !== props.status.max_unlock_ms,
)
const locked = computed(() => props.status.unlock?.state !== 'unlocked')
const blockedByLock = computed(() => locked.value && changeNeedsUnlock(props.status, draft.value))
const notes = computed(() => changeNotes(props.status, draft.value))
const canRotate = computed(() => props.status.mode !== 'off' && !locked.value)

async function confirm() {
  const action = confirming.value
  failure.value = null
  try {
    if (action === 'save') await props.save({ ...draft.value, expected_generation: props.status.key_generation })
    else if (action === 'rotate') await props.rotate()
    confirming.value = null
  } catch (cause) {
    failure.value = encryptionError(cause)
  }
}
</script>

<template>
  <section class="surface" data-encryption-settings>
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Encryption settings</h2>
    </header>
    <div class="space-y-3 px-5 py-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs font-medium text-foreground">
          Mode
          <Select v-model="mode" class="mt-1.5" :options="options(MODE_LABEL)" aria-label="Encryption mode" />
        </label>
        <label class="text-xs font-medium text-foreground">
          Longest unlock
          <Select v-model="maxUnlock" class="mt-1.5" :options="maxUnlockOptions(status.max_unlock_ms)" aria-label="Longest unlock" />
        </label>
        <label v-if="mode !== 'off'" class="text-xs font-medium text-foreground">
          Cipher
          <Select v-model="cipher" class="mt-1.5" :options="options(CIPHER_LABEL)" aria-label="Cipher" />
        </label>
        <label v-if="mode !== 'off'" class="text-xs font-medium text-foreground">
          Block keys
          <Select v-model="blockKeys" class="mt-1.5" :options="options(BLOCK_KEYS_LABEL)" aria-label="Block keys" />
        </label>
      </div>
      <Notice v-if="changed && notes.length" tone="info" :lines="notes" />
      <Notice v-if="changed && blockedByLock" tone="warning">Unlock the bucket first; this change reads the stored data.</Notice>
      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" :disabled="!changed || blockedByLock || busy" @click="confirming = 'save'">Save changes</Button>
        <Button v-if="changed" size="sm" variant="outline" :disabled="busy" @click="reset">Discard</Button>
        <Button
          v-if="status.mode !== 'off'"
          class="ml-auto"
          size="sm"
          variant="outline"
          :disabled="!canRotate || busy"
          @click="confirming = 'rotate'"
        >
          Rotate key
        </Button>
      </div>
      <p v-if="status.mode !== 'off' && locked" class="text-[11px] text-muted-foreground">
        Rotation needs the bucket unlocked.
      </p>
      <Notice v-if="failure && !confirming" tone="error">{{ failure }}</Notice>
    </div>

    <Dialog :open="confirming !== null" @update:open="(open: boolean) => !open && (confirming = null)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ confirming === 'rotate' ? 'Rotate the bucket key?' : 'Change the encryption?' }}</DialogTitle>
          <DialogDescription>
            {{ confirming === 'rotate' ? 'Open uploads must finish first.' : 'Open uploads must finish first; new writes follow the new setting.' }}
          </DialogDescription>
        </DialogHeader>
        <Notice v-if="confirming === 'rotate' || notes.length" tone="warning" :lines="confirming === 'rotate' ? ROTATION_NOTES : notes" />
        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="confirming = null">Cancel</Button>
          <Button size="sm" :disabled="busy" @click="confirm">{{ confirming === 'rotate' ? 'Rotate' : 'Save' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
