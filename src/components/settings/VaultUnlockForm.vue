<script setup lang="ts">
// Opens the provider keys kept on the node with the passphrase, or with the
// recovery code when the passphrase is forgotten.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { useUserVault } from '@/composables/useUserVault'
import { errorMessage } from '@/lib/utils'

const emit = defineEmits<{ (e: 'done'): void }>()
const { unlock, unlockWithRecovery } = useUserVault()

const useRecovery = ref(false)
const secret = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)
const canUnlock = computed(() => secret.value.trim().length > 0 && !busy.value)

function switchMode() {
  useRecovery.value = !useRecovery.value
  secret.value = ''
  failure.value = null
}

async function submit() {
  if (!canUnlock.value) return
  busy.value = true
  failure.value = null
  try {
    if (useRecovery.value) await unlockWithRecovery(secret.value)
    else await unlock(secret.value)
    secret.value = ''
    emit('done')
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <label class="text-xs font-medium text-foreground" for="vault-secret">
        {{ useRecovery ? 'Recovery code' : 'Passphrase' }}
      </label>
      <Input
        id="vault-secret"
        v-model="secret"
        :type="useRecovery ? 'text' : 'password'"
        class="mt-1.5"
        :autocomplete="useRecovery ? 'off' : 'current-password'"
        :placeholder="useRecovery ? 'The code you saved when you created the passphrase' : 'Your passphrase'"
        @keydown.enter.prevent="submit"
      />
    </div>
    <p v-if="useRecovery" class="text-xs text-muted-foreground">
      Once unlocked, set a new passphrase with Change passphrase; the recovery code stays valid.
    </p>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <button type="button" class="text-xs text-primary hover:underline" @click="switchMode">
        {{ useRecovery ? 'Use the passphrase' : 'Use the recovery code' }}
      </button>
      <Button size="sm" :disabled="!canUnlock" @click="submit">{{ busy ? 'Unlocking' : 'Unlock' }}</Button>
    </div>
  </div>
</template>
