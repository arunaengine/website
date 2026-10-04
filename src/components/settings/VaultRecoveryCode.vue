<script setup lang="ts">
// The recovery code of a vault this session just made. It stays until the user confirms
// storing it; a lock hides it until the next unlock.
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import { useUserVault } from '@/composables/useUserVault'

const { recoveryCode, dismissRecovery } = useUserVault()
</script>

<template>
  <div v-if="recoveryCode" class="space-y-3" data-recovery>
    <Notice tone="warning" title="Store your recovery code">
      Keep it somewhere safe, such as a password manager. It opens your keys if you forget the passphrase. Once you
      confirm, it is not shown again.
    </Notice>
    <div class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <code class="min-w-0 flex-1 break-all font-mono text-xs" data-recovery-code>{{ recoveryCode }}</code>
      <CopyButton :value="recoveryCode" label="Copy the recovery code" />
    </div>
    <div class="flex justify-end">
      <Button size="sm" @click="dismissRecovery">I stored it</Button>
    </div>
  </div>
</template>
