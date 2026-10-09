<script setup lang="ts">
// Names the realm that keeps the vault, when the session is foreign or linked.
import { computed } from 'vue'
import { vaultRealmNote, type VaultAction } from '@/composables/useVaultRealm'

const props = defineProps<{ action: VaultAction }>()
const note = computed(() => vaultRealmNote(props.action))
</script>

<template>
  <p v-if="note" class="text-xs font-medium text-foreground" data-vault-realm>{{ note }}</p>
</template>
