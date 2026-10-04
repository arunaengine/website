<script setup lang="ts">
// What stands between the user and the keys on the node: the passphrase to
// create when there is none yet, or the one to enter while they are locked.
import { watch } from 'vue'
import VaultCreateForm from './VaultCreateForm.vue'
import VaultRecoveryCode from './VaultRecoveryCode.vue'
import VaultUnlockForm from './VaultUnlockForm.vue'
import { useUserVault } from '@/composables/useUserVault'

const emit = defineEmits<{ (e: 'done'): void }>()
const { state, loaded, error, recoveryCode } = useUserVault()

// Passed once the keys are unlocked and no new recovery code waits to be stored. The forms
// unmount when the state changes, so the gate reports it itself.
watch(
  () => state.value === 'unlocked' && !recoveryCode.value,
  (passed) => {
    if (passed) emit('done')
  },
)
</script>

<template>
  <VaultRecoveryCode />
  <div v-if="state === 'absent' && loaded && !error" class="space-y-2">
    <p class="text-xs text-muted-foreground">
      Choose a passphrase. It seals the key before it reaches the node, and the node cannot read it.
    </p>
    <VaultCreateForm />
  </div>
  <div v-else-if="state === 'locked'" class="space-y-2">
    <p class="text-xs text-muted-foreground">Your provider keys on this node are locked.</p>
    <VaultUnlockForm />
  </div>
  <p v-else-if="error" class="text-xs text-destructive">
    The provider keys on this node could not be read: {{ error }}
  </p>
</template>
