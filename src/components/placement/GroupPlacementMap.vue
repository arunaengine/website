<script setup lang="ts">
import { computed } from 'vue'
import LocationAggregates from '@/components/placement/LocationAggregates.vue'
import { aggregateByLocation } from '@/lib/placement'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import type { GroupPlacementResponse, RealmNodeInfo } from '@/lib/api'

// The group placement map IS location aggregates of the computed node set —
// exactly like the realm health panel. No geography, no per-document dots.
const props = defineProps<{
  placement: GroupPlacementResponse
  nodes: RealmNodeInfo[]
}>()

const nodeById = computed(() => new Map(props.nodes.map((node) => [node.node_id, node])))

const matched = computed(() =>
  props.placement.node_ids
    .map((id) => nodeById.value.get(id))
    .filter((node): node is RealmNodeInfo => Boolean(node)),
)

const aggregates = computed(() => aggregateByLocation(matched.value))

// Selected ids the realm node list no longer reports — surfaced honestly
// instead of being silently dropped from the map.
const unmatchedIds = computed(() =>
  props.placement.node_ids.filter((id) => !nodeById.value.has(id)),
)

const computedAtIso = computed(() => new Date(props.placement.computed_at_ms).toISOString())
</script>

<template>
  <div>
    <LocationAggregates :aggregates="aggregates" />

    <p v-if="unmatchedIds.length" class="mt-3 text-[11px] text-muted-foreground">
      {{ unmatchedIds.length }} selected
      {{ unmatchedIds.length === 1 ? 'node' : 'nodes' }} not present in the realm node list:
      <span class="font-mono">{{ unmatchedIds.map((id) => truncateMiddle(id, 8, 6)).join(', ') }}</span>
    </p>

    <p class="mt-3 text-[11px] text-muted-foreground">
      Computed {{ relativeTime(computedAtIso) }}<template v-if="placement.strategy_id">
        · strategy <span class="font-mono">{{ truncateMiddle(placement.strategy_id, 8, 6) }}</span>
      </template>
    </p>
  </div>
</template>
