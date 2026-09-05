<script setup lang="ts">
// What stands between the user and the keys on the node: the passphrase to
// create when there is none yet, or the one to enter while they are locked.
import VaultCreateForm from './VaultCreateForm.vue'
import VaultUnlockForm from './VaultUnlockForm.vue'
import { useUserVault } from '@/composables/useUserVault'

const emit = defineEmits<{ (e: 'done'): void }>()
const { state, loaded, error } = useUserVault()
</script>

<template>
  <div v-if="state === 'absent' && loaded && !error" class="space-y-2">
    <p class="text-xs text-muted-foreground">
      Choose a passphrase. It seals the key before it reaches the node, and the node cannot read it.
    </p>
    <VaultCreateForm @done="emit('done')" />
  </div>
  <div v-else-if="state === 'locked'" class="space-y-2">
    <p class="text-xs text-muted-foreground">Your provider keys on this node are locked.</p>
    <VaultUnlockForm @done="emit('done')" />
  </div>
  <p v-else-if="error" class="text-xs text-destructive">
    The provider keys on this node could not be read: {{ error }}
  </p>
</template>
