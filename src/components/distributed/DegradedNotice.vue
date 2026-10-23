<script setup lang="ts">
// A range whose coordinator cannot be reached. The details are in the hover text.
import Notice from '@/components/ui/Notice.vue'
import { stamp } from '@/lib/distributedMock'
import type { MockRange } from '@/lib/distributedMockData'

defineProps<{ range: MockRange }>()
</script>

<template>
  <div :title="`Nothing waits in a queue. Reads continue from the copies on ${range.replicas.join(', ') || 'no other node'}.`">
    <Notice tone="warning" title="Degraded">
      Writes to range {{ range.id }} are refused: {{ range.coordinator }} has been unreachable since {{ stamp(range.degradedSince ?? '') }}.
    </Notice>
  </div>
</template>
