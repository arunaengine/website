<script setup lang="ts">
// Warns while a role names single nodes of a bucket that is stored on several nodes.
import { computed, toRef } from 'vue'
import PermissionNotice from '@/components/distributed/PermissionNotice.vue'
import { useGrantGaps } from '@/composables/useGrantGaps'
import { mockEnabled } from '@/lib/distributedMock'
import { grantWarnings } from '@/lib/distributedMockData'

const props = defineProps<{ paths: string[]; role: string }>()

const { gaps } = useGrantGaps(toRef(props, 'paths'))
const warnings = computed<{ bucket: string; missing: string[]; glob?: string }[]>(() => [
  ...gaps.value,
  ...(mockEnabled() ? grantWarnings(props.paths).filter((mock) => !gaps.value.some((gap) => gap.bucket === mock.bucket)) : []),
])
</script>

<template>
  <div v-if="warnings.length" class="mt-3 space-y-2">
    <PermissionNotice
      v-for="warning in warnings"
      :key="warning.bucket"
      :holder="role || 'This role'"
      :bucket="warning.bucket"
      :missing="warning.missing"
      :glob="warning.glob"
    />
  </div>
</template>
