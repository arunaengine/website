<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { MapPin } from '@lucide/vue'
import { formatBytes, formatNumber } from '@/lib/utils'
import type { LocationAggregate } from '@/lib/placement'

const props = defineProps<{ aggregates: LocationAggregate[] }>()

// Widest bucket drives the proportional bar; guard against a divide-by-zero for
// an all-empty list (which renders the empty state instead).
const maxNodeCount = computed(() =>
  props.aggregates.reduce((max, a) => Math.max(max, a.nodeCount), 0) || 1,
)

function barWidth(a: LocationAggregate): string {
  return `${(a.nodeCount / maxNodeCount.value) * 100}%`
}

function connectedWidth(a: LocationAggregate): string {
  return a.nodeCount ? `${(a.connectedCount / a.nodeCount) * 100}%` : '0%'
}
</script>

<template>
  <div>
    <ul v-if="aggregates.length" class="divide-y divide-border">
      <li v-for="a in aggregates" :key="a.location" class="px-1 py-3 first:pt-1 last:pb-1">
        <div class="flex flex-wrap items-center gap-2">
          <MapPin class="h-3.5 w-3.5 shrink-0 text-primary" />
          <span
            :class="[
              'min-w-0 truncate text-sm font-medium',
              a.mapped ? 'text-foreground' : 'font-mono text-muted-foreground',
            ]"
          >
            {{ a.location }}
          </span>
          <Badge variant="outline" class="tabular-nums">{{ a.nodeCount }} {{ a.nodeCount === 1 ? 'node' : 'nodes' }}</Badge>
          <Badge v-if="a.connectedCount > 0" variant="success" class="tabular-nums">{{ a.connectedCount }} connected</Badge>
          <Badge v-else-if="a.mapped" variant="warn" class="tabular-nums">0 connected</Badge>
          <Badge v-if="a.fullCount > 0" variant="destructive" class="tabular-nums">{{ a.fullCount }} full</Badge>
          <Badge v-if="a.drainingCount > 0" variant="warn" class="tabular-nums">{{ a.drainingCount }} draining</Badge>
          <span v-if="a.mapped" class="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            weight Σ{{ a.totalWeight }}
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
          <div class="h-full rounded-full bg-primary/20" :style="{ width: barWidth(a) }">
            <div class="h-full rounded-full bg-primary" :style="{ width: connectedWidth(a) }" />
          </div>
        </div>
        <p class="mt-1.5 font-mono text-[11px] text-muted-foreground">
          <template v-if="a.reportingCount > 0">
            {{ formatBytes(a.storageBytesUsed)
            }}<template v-if="a.documentsHeld !== null"> · {{ formatNumber(a.documentsHeld) }} docs</template>
            · across {{ a.reportingCount }}/{{ a.nodeCount }} reporting
          </template>
          <template v-else>no published utilization</template>
        </p>
      </li>
    </ul>
    <p v-else class="px-1 py-6 text-center text-xs text-muted-foreground">
      No nodes are mapped to placement locations yet.
    </p>
  </div>
</template>
