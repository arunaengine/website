<script setup lang="ts">
// Warns while a role names single nodes of a bucket that is stored on several nodes.
import { computed } from 'vue'
import PermissionNotice from '@/components/distributed/PermissionNotice.vue'
import { mockEnabled } from '@/lib/distributedMock'
import { grantWarnings } from '@/lib/distributedMockData'

const props = defineProps<{ paths: string[]; role: string }>()

const warnings = computed(() => (mockEnabled() ? grantWarnings(props.paths) : []))
</script>

<template>
  <div v-if="warnings.length" class="mt-3 space-y-2">
    <PermissionNotice
      v-for="warning in warnings"
      :key="warning.bucket"
      :holder="role || 'This role'"
      :bucket="warning.bucket"
      :missing="warning.missing"
    />
  </div>
</template>
