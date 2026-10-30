<script setup lang="ts">
import EmptyState from '@/components/ui/EmptyState.vue'
import { CircleCheck, Files, HardDrive, MapPin, Server, TriangleAlert } from '@lucide/vue'
import { formatBytes, formatNumber } from '@/lib/utils'
import type { LocationAggregate } from '@/lib/placement'

defineProps<{ aggregates: LocationAggregate[] }>()
</script>

<template>
  <div>
    <ul v-if="aggregates.length" class="divide-y divide-border">
      <li
        v-for="a in aggregates"
        :key="a.location"
        class="flex flex-wrap items-center gap-x-5 gap-y-1 py-2.5 type-secondary first:pt-0 last:pb-0 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0"
      >
        <span :class="['min-w-0 font-medium', a.mapped ? 'text-foreground' : 'text-muted-foreground']">
          <MapPin class="text-primary" aria-hidden="true" /><span class="truncate">{{ a.location }}</span>
        </span>
        <span><Server aria-hidden="true" />{{ a.nodeCount }} {{ a.nodeCount === 1 ? 'node' : 'nodes' }}</span>
        <span v-if="a.mapped" :class="a.connectedCount ? '' : 'text-status-warn'">
          <CircleCheck v-if="a.connectedCount" class="text-status-ok" aria-hidden="true" /><TriangleAlert v-else aria-hidden="true" />{{ a.connectedCount }} connected
        </span>
        <span v-if="a.fullCount > 0" class="text-destructive"><TriangleAlert aria-hidden="true" />{{ a.fullCount }} full</span>
        <span v-if="a.drainingCount > 0" class="text-status-warn"><TriangleAlert aria-hidden="true" />{{ a.drainingCount }} draining</span>
        <template v-if="a.reportingCount > 0">
          <span><HardDrive aria-hidden="true" />{{ a.reportingCount < a.nodeCount ? 'at least ' : '' }}{{ formatBytes(a.storageBytesUsed) }} stored</span>
          <span v-if="a.documentsHeld !== null"><Files aria-hidden="true" />{{ a.reportingCount < a.nodeCount ? 'at least ' : '' }}{{ formatNumber(a.documentsHeld) }} documents</span>
          <span v-if="a.reportingCount < a.nodeCount">{{ a.reportingCount }}/{{ a.nodeCount }} reporting</span>
        </template>
        <span v-else class="text-muted-foreground">No usage reported</span>
      </li>
    </ul>
    <EmptyState v-else compact title="No nodes are mapped to placement locations yet." />
  </div>
</template>
