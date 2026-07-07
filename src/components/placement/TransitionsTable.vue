<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import { ArrowLeftRight } from '@lucide/vue'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import type { BadgeVariant } from '@/components/nodes/node-display'
import type { PlacementTransition, PlacementTransitionState } from '@/lib/api'

defineProps<{ transitions: PlacementTransition[] }>()

const STATE_VARIANT: Record<PlacementTransitionState, BadgeVariant> = {
  pending: 'outline',
  copying: 'warn',
  verifying: 'warn',
  done: 'success',
  failed: 'destructive',
}
</script>

<template>
  <div v-if="transitions.length" class="overflow-x-auto">
    <table class="w-full text-left text-xs">
      <thead>
        <tr class="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <th class="px-3 py-2">Subject</th>
          <th class="px-3 py-2">From → To</th>
          <th class="px-3 py-2">State</th>
          <th class="px-3 py-2">Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in transitions" :key="t.transition_id" class="border-b border-border/60">
          <td class="px-3 py-2 font-mono text-foreground/80" :title="t.subject">{{ truncateMiddle(t.subject, 10, 6) }}</td>
          <td class="px-3 py-2">
            <span class="inline-flex items-center gap-1.5 font-mono text-muted-foreground">
              <template v-if="t.from_node_id">{{ truncateMiddle(t.from_node_id, 8, 4) }}</template>
              <template v-else>— (new replica)</template>
              <ArrowLeftRight class="h-3 w-3 shrink-0 text-muted-foreground/70" />
              {{ truncateMiddle(t.to_node_id, 8, 4) }}
            </span>
          </td>
          <td class="px-3 py-2">
            <Badge :variant="STATE_VARIANT[t.state]" class="text-[10px] uppercase">{{ t.state }}</Badge>
          </td>
          <td class="px-3 py-2 tabular-nums text-muted-foreground">{{ relativeTime(new Date(t.updated_at_ms).toISOString()) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-else class="px-1 py-4 text-xs text-muted-foreground">No transitions in flight.</p>
</template>
