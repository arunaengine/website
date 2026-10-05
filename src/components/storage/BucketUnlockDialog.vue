<script setup lang="ts">
// Unlocks a bucket from this browser: the vault and the sealed copy open here,
// and only the bucket key and the chosen length go to the bucket's node.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import VaultUnlockForm from '@/components/settings/VaultUnlockForm.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useUserVault } from '@/composables/useUserVault'
import { durationOptions, encryptionError } from '@/lib/bucketEncryption'
import type { KeyRole } from '@/lib/api'
import type { UnlockOutcome } from '@/lib/vault/bucketUnlock'

const props = defineProps<{
  open: boolean
  bucket: string
  generation: number
  role: KeyRole
  maxUnlockMs: number | null
  unlock: (generation: number, durationMs?: number) => Promise<UnlockOutcome | null>
}>()
const emit = defineEmits<{ (e: 'update:open', open: boolean): void }>()

const { state: vaultState, loaded: vaultLoaded, error: vaultError, load: loadVault } = useUserVault()
const duration = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)
const outcome = ref<UnlockOutcome | null>(null)
const options = computed(() => durationOptions(props.maxUnlockMs))

const WARNINGS = [
  'An unlock lets every reader with access on this node read the bucket until it locks.',
  'This browser remembers your vault key. On Aruna Desktop the browser and the node share one disk, so that disk can open your bucket keys.',
]
const KEY_NOTES: Record<string, string> = {
  mismatch: 'Your key directory names a key that is not in this vault. Check Settings, Provider keys.',
  unavailable: 'Your key could not be checked in the key directory, so new copies for you may wait.',
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    duration.value = ''
    failure.value = null
    outcome.value = null
    if (!vaultLoaded.value) void loadVault()
  },
  { immediate: true },
)

async function submit() {
  busy.value = true
  failure.value = null
  try {
    outcome.value = await props.unlock(props.generation, duration.value ? Number(duration.value) : undefined)
    if (!outcome.value) {
      failure.value = 'The bucket or your session changed meanwhile, so the result is not shown. Check the bucket state.'
    }
  } catch (cause) {
    failure.value = encryptionError(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Unlock {{ bucket }}</DialogTitle>
        <DialogDescription>
          Your vault opens your copy of key generation {{ generation }} in this browser. Only that key and the unlock
          length go to the node.
          <template v-if="role === 'source'">It is the previous key, needed while stored versions are rewritten.</template>
        </DialogDescription>
      </DialogHeader>

      <div v-if="outcome" class="space-y-3">
        <Notice v-if="outcome.kind === 'unlocked'" tone="success">The node confirmed the unlock.</Notice>
        <Notice v-else tone="warning" title="The node did not confirm the unlock">
          The bucket may or may not be unlocked. The Encryption tab shows what the node reports now; check it before you
          try again.
        </Notice>
        <Notice v-if="KEY_NOTES[outcome.ownKey]" tone="warning">{{ KEY_NOTES[outcome.ownKey] }}</Notice>
      </div>
      <div v-else class="space-y-3">
        <Spinner v-if="!vaultLoaded && !vaultError" show-label label="Opening your vault" />
        <Notice v-else-if="vaultState === 'unsupported'" tone="warning">
          This node cannot keep a vault, so no bucket key can be opened here.
        </Notice>
        <Notice v-else-if="vaultError && vaultState !== 'unlocked'" tone="error">{{ vaultError }}</Notice>
        <Notice v-else-if="vaultState === 'absent'" tone="info">
          You have no vault yet.
          <RouterLink :to="{ name: 'settings', query: { tab: 'keys' } }" class="font-medium text-primary hover:underline">
            Set one up in Settings
          </RouterLink>
          . Your copy of the bucket key is made at the next unlock by another key holder.
        </Notice>
        <VaultUnlockForm v-else-if="vaultState === 'locked'" />
        <template v-else>
          <div>
            <label class="text-xs font-medium text-foreground" for="unlock-length">How long</label>
            <Select id="unlock-length" v-model="duration" class="mt-1.5" :options="options" aria-label="Unlock length" />
          </div>
          <Notice tone="warning" :lines="WARNINGS" />
        </template>
        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">{{ outcome ? 'Done' : 'Cancel' }}</Button>
        <Button v-if="!outcome && vaultState === 'unlocked'" size="sm" :disabled="busy" @click="submit">
          {{ busy ? 'Unlocking' : 'Unlock' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
