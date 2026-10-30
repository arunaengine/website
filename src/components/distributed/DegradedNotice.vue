<script setup lang="ts">
// Ranges whose coordinator cannot be reached, in one notice named by the unreachable nodes.
import { computed } from 'vue'
import Notice from '@/components/ui/Notice.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { stamp } from '@/lib/distributedMock'
import type { DistributedRange } from '@/lib/distribution'

const props = defineProps<{ ranges: DistributedRange[] }>()
const { displayName } = useRealmNodes()
const names = computed(() => [...new Set(props.ranges.map((range) => range.coordinator))].map(displayName))
const since = computed(() => props.ranges.map((range) => range.degradedSince).filter((at): at is string => Boolean(at)).sort()[0])
const copies = computed(() => [...new Set(props.ranges.flatMap((range) => range.replicas))].map(displayName).join(', '))
</script>

<template>
  <Notice v-if="ranges.length" tone="warning" :title="`Writes are paused: ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} unreachable`">
    <template v-if="since">Since {{ stamp(since) }}. </template>
    {{ copies ? `Reads continue from the copies on ${copies}.` : 'No other node holds a copy to read from.' }}
  </Notice>
</template>
