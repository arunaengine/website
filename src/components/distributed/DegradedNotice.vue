<script setup lang="ts">
// A range whose coordinator cannot be reached. The details are in the hover text.
import Notice from '@/components/ui/Notice.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { stamp } from '@/lib/distributedMock'
import type { DistributedRange } from '@/lib/distribution'

defineProps<{ range: DistributedRange }>()
const { displayName } = useRealmNodes()
</script>

<template>
  <div :title="`Nothing waits in a queue. Reads continue from the copies on ${range.replicas.map(displayName).join(', ') || 'no other node'}.`">
    <Notice tone="warning" title="Degraded">
      Writes to range {{ range.id }} are refused: {{ displayName(range.coordinator) }}
      <template v-if="range.degradedSince">has been unreachable since {{ stamp(range.degradedSince) }}.</template>
      <template v-else>is unreachable.</template>
    </Notice>
  </div>
</template>
