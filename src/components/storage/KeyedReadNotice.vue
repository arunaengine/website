<script setup lang="ts">
// What a read of a locked bucket waits for. Opening the vault or a new key resumes the read.
import { computed } from 'vue'
import VaultGate from '@/components/settings/VaultGate.vue'
import VaultUnlockForm from '@/components/settings/VaultUnlockForm.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { useUserVault } from '@/composables/useUserVault'

const props = defineProps<{ wait: 'vault' | 'setup' | 'pending' | 'preparing' | null; action: 'download' | 'preview' }>()
const emit = defineEmits<{ (e: 'cancel'): void }>()
const { state } = useUserVault()

const result = computed(() => (props.action === 'download' ? 'download starts' : 'preview opens'))
</script>

<template>
  <Notice v-if="wait === 'setup'" title="Set up your personal vault" class="space-y-2">
    <p>Your keys for encrypted files are sealed to your vault. The {{ result }} once a key holder issues yours.</p>
    <VaultGate />
    <Button variant="outline" size="sm" @click="emit('cancel')">Cancel</Button>
  </Notice>
  <Notice v-else-if="wait === 'vault'" title="Open your personal vault to read this file" class="space-y-2">
    <p>Your keys for encrypted files are in your vault. The {{ result }} right after.</p>
    <VaultUnlockForm v-if="state === 'locked'" />
    <VaultGate v-else />
    <Button variant="outline" size="sm" @click="emit('cancel')">Cancel</Button>
  </Notice>
  <Notice v-else-if="wait === 'pending'" tone="warning" title="Waiting for an encryption key from a key holder">
    <p>
      You have access, but your key is not ready yet. It is issued when a key holder opens their vault or the
      bucket is unlocked. Your {{ result }} on its own when it arrives.
    </p>
    <Button variant="outline" size="sm" class="mt-2" @click="emit('cancel')">Cancel</Button>
  </Notice>
  <Notice v-else-if="wait === 'preparing'" title="This copy is waiting for a key holder to finish preparing it">
    <p>It can be read once the bucket is unlocked next. The original file stays readable.</p>
  </Notice>
</template>
