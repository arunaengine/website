<script setup lang="ts">
// The hint for a range whose coordinator cannot be reached. No node takes over by itself.
import Notice from '@/components/ui/Notice.vue'
import { stamp } from '@/lib/distributedMock'
import type { MockRange } from '@/lib/distributedMockData'

defineProps<{ range: MockRange }>()
</script>

<template>
  <Notice tone="warning" title="This bucket is degraded">
    <p>
      Range {{ range.id }} ({{ range.lower || '(start)' }} to {{ range.upper || '(end)' }}): its coordinator
      {{ range.coordinator }} has been unreachable since {{ stamp(range.degradedSince ?? '') }}.
    </p>
    <p class="mt-1">
      Writes to this range are refused until {{ range.coordinator }} is reachable again. Nothing waits in a queue.
      Reads continue from the copies on {{ range.replicas.join(', ') || 'no other node' }}.
    </p>
  </Notice>
</template>
