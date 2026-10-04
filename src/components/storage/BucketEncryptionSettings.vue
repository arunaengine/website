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
  actionError,
  changeNotes,
  maxUnlockOptions,
  type EncryptionDraft,
} from '@/lib/bucketEncryption'

const props = defineProps<{
  status: BucketEncryptionResponse
  busy: boolean
  save: (request: EncryptionDraft & { expected_generation: number }) => Promise<unknown>
  rotate: (expectedGeneration: number) => Promise<unknown>
}>()

const mode = ref<EncryptionMode>('off')
const cipher = ref<BlockCipher>('chacha20_poly1305')
const blockKeys = ref<BlockKeys>('content_derived')
const maxUnlock = ref('')
const failure = ref<string | null>(null)

function settingsOf(status: BucketEncryptionResponse): EncryptionDraft {
  return { mode: status.mode, cipher: status.cipher, block_keys: status.block_keys, max_unlock_ms: status.max_unlock_ms }
}

function same(a: EncryptionDraft, b: EncryptionDraft): boolean {
  return a.mode === b.mode && a.cipher === b.cipher && a.block_keys === b.block_keys && a.max_unlock_ms === b.max_unlock_ms
}

function apply(next: EncryptionDraft) {
  mode.value = next.mode
  cipher.value = next.cipher
  blockKeys.value = next.block_keys
  maxUnlock.value = next.max_unlock_ms === null ? '' : String(next.max_unlock_ms)
}

/** The node's settings the draft started from; a refresh keeps a draft that differs from them. */
const base = ref<EncryptionDraft>(settingsOf(props.status))
apply(base.value)

function reset() {
  base.value = settingsOf(props.status)
  apply(base.value)
}

const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const draft = computed<EncryptionDraft>(() => ({
  mode: mode.value,
  cipher: cipher.value,
  block_keys: blockKeys.value,
  max_unlock_ms: maxUnlock.value ? Number(maxUnlock.value) : null,
}))
const changed = computed(() => !same(draft.value, base.value))
watch(
  () => props.status,
  (next) => {
    if (!changed.value) apply(settingsOf(next))
    base.value = settingsOf(next)
  },
)
const locked = computed(() => props.status.unlock?.state !== 'unlocked')
const blockedByLock = computed(() => locked.value && changeNeedsUnlock(props.status, draft.value))
const notes = computed(() => changeNotes(props.status, draft.value))
const canRotate = computed(() => props.status.mode !== 'off' && !locked.value)

/** What a confirmation was opened for; a change of the bucket under it asks for a new one. */
interface Pending {
  action: 'save' | 'rotate'
  draft: EncryptionDraft
  generation: number
  notes: string[]
  context: string
}
const pending = ref<Pending | null>(null)

function contextOf(status: BucketEncryptionResponse): string {
  return JSON.stringify([status.bucket_id, status.key_generation, status.storage_generation, settingsOf(status)])
}

const stale = computed(() => pending.value !== null && pending.value.context !== contextOf(props.status))

function ask(action: Pending['action']) {
  failure.value = null
  pending.value = {
    action,
    draft: { ...draft.value },
    generation: props.status.key_generation,
    notes: action === 'rotate' ? ROTATION_NOTES : notes.value,
    context: contextOf(props.status),
  }
}

async function confirm() {
  const asked = pending.value
  if (!asked || stale.value) return
  failure.value = null
  try {
    if (asked.action === 'save') await props.save({ ...asked.draft, expected_generation: asked.generation })
    else await props.rotate(asked.generation)
    if (pending.value === asked) pending.value = null
  } catch (cause) {
    failure.value = actionError(cause)
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
        <Button size="sm" :disabled="!changed || blockedByLock || busy" @click="ask('save')">Save changes</Button>
        <Button v-if="changed" size="sm" variant="outline" :disabled="busy" @click="reset">Discard</Button>
        <Button
          v-if="status.mode !== 'off'"
          class="ml-auto"
          size="sm"
          variant="outline"
          :disabled="!canRotate || busy"
          @click="ask('rotate')"
        >
          Rotate key
        </Button>
      </div>
      <p v-if="status.mode !== 'off' && locked" class="text-[11px] text-muted-foreground">
        Rotation needs the bucket unlocked.
      </p>
      <Notice v-if="failure && !pending" tone="error">{{ failure }}</Notice>
    </div>

    <Dialog :open="pending !== null" @update:open="(open: boolean) => !open && (pending = null)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ pending?.action === 'rotate' ? 'Rotate the bucket key?' : 'Change the encryption?' }}</DialogTitle>
          <DialogDescription>
            {{ pending?.action === 'rotate' ? 'Open uploads must finish first.' : 'Open uploads must finish first; new writes follow the new setting.' }}
          </DialogDescription>
        </DialogHeader>
        <Notice v-if="pending?.notes.length" tone="warning" :lines="pending.notes" />
        <Notice v-if="stale" tone="warning">
          The bucket settings or its key changed while this was open. Close it and review the change again.
        </Notice>
        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="pending = null">Cancel</Button>
          <Button size="sm" :disabled="busy || stale" @click="confirm">{{ pending?.action === 'rotate' ? 'Rotate' : 'Save' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
