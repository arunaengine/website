<script setup lang="ts">
// Nodes of one bucket: state, data strategy, metadata coverage and lag.
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { MEMBER_TONE, mockNode, stamp } from '@/lib/distributedMock'
import type { DistributedBucket } from '@/lib/distribution'
import { toneVariant } from '@/lib/stateBadge'

const props = defineProps<{ bucket: DistributedBucket }>()

function roles(nodeId: string) {
  const ranges = props.bucket.ranges
  return {
    writes: ranges.filter((range) => range.coordinator === nodeId).length,
    copies: ranges.filter((range) => range.replicas.includes(nodeId)).length,
  }
}
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-border">
    <table class="w-full min-w-[52rem] text-left text-xs">
      <thead class="border-b border-border bg-muted/40 text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">Node</th>
          <th class="px-3 py-2 font-medium">Location</th>
          <th class="px-3 py-2 font-medium">State</th>
          <th class="px-3 py-2 font-medium">Data strategy</th>
          <th class="px-3 py-2 font-medium">Metadata</th>
          <th class="px-3 py-2 font-medium">Writes</th>
          <th class="px-3 py-2 font-medium">Copies</th>
          <th class="px-3 py-2 font-medium">Replication lag</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="member in bucket.members" :key="member.nodeId">
          <td class="px-3 py-2 font-medium"><NodeLabel :node-id="member.nodeId" /></td>
          <td class="px-3 py-2">{{ mockNode(member.nodeId)?.location }}</td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge :variant="toneVariant(MEMBER_TONE[member.state])" size="sm">{{ member.state }}</Badge>
              <Badge v-if="member.unreachableSince" variant="warn" size="sm" :title="`Since ${stamp(member.unreachableSince)}`">unreachable</Badge>
            </div>
          </td>
          <td class="px-3 py-2">{{ member.strategy }}</td>
          <td class="px-3 py-2">{{ member.coverage }}</td>
          <td class="px-3 py-2">{{ roles(member.nodeId).writes }} {{ roles(member.nodeId).writes === 1 ? 'range' : 'ranges' }}</td>
          <td class="px-3 py-2">{{ roles(member.nodeId).copies }} {{ roles(member.nodeId).copies === 1 ? 'range' : 'ranges' }}</td>
          <td class="px-3 py-2">{{ member.lag }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
