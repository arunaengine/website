<script setup lang="ts">
// The bucket is being deleted. Writes have stopped; the nodes delete their own buckets after
// every coordinator has fenced its ranges.
import Notice from '@/components/ui/Notice.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { LiveDeletion } from '@/lib/distribution'

defineProps<{ deletion: LiveDeletion }>()
const { displayName } = useRealmNodes()
</script>

<template>
  <Notice tone="warning" title="Deleting">
    <template v-if="deletion.committed">
      Writes have stopped. Every node deletes its bucket. A node that is offline finishes when it returns.
    </template>
    <template v-else>
      Writes have stopped. The deletion starts when every coordinator has fenced its ranges.
      Waiting for {{ deletion.waiting.map(displayName).join(', ') || 'the coordinators' }}.
    </template>
  </Notice>
</template>
