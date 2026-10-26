<script setup lang="ts">
// Ranges that move to another coordinator. Writes to a fenced range fail and can be retried.
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import type { DistributedBucket, LiveTransfer } from '@/lib/distribution'

const props = defineProps<{ bucket: DistributedBucket; transfers: LiveTransfer[] }>()

function bounds(rangeId: string): string {
  const range = props.bucket.ranges.find((item) => item.id === rangeId)
  return range ? `${range.lower || '(start)'} to ${range.upper || '(end)'}` : rangeId
}
</script>

<template>
  <section class="surface">
    <header class="border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Moves in progress</h2>
    </header>
    <ul class="divide-y divide-border text-xs">
      <li v-for="transfer in transfers" :key="transfer.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
        <span class="font-mono">{{ bounds(transfer.rangeId) }}</span>
        <span class="flex items-center gap-1"><NodeLabel :node-id="transfer.from" /> to <NodeLabel :node-id="transfer.to" /></span>
        <span class="text-muted-foreground">{{ transfer.role === 'leave' ? 'The old node leaves the range' : 'The old node keeps a copy' }}</span>
        <Badge :variant="transfer.fenced ? 'warn' : 'outline'" size="sm" class="ml-auto">
          {{ transfer.fenced ? 'Writes wait' : 'Catching up' }}
        </Badge>
      </li>
    </ul>
  </section>
</template>
