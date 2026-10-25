<script setup lang="ts">
// Key ranges of one bucket stored on several nodes. A long list shows the first rows and a button for the rest.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { stamp } from '@/lib/distributedMock'
import { isDegraded, type DistributedRange } from '@/lib/distribution'
import { formatBytes, formatNumber } from '@/lib/utils'

const props = defineProps<{ ranges: DistributedRange[] }>()

const SHOWN = 8

// A range that was split from another names it. The parent may be gone, so its id stands in.
function parentBounds(id?: string): string {
  if (!id) return ''
  const parent = props.ranges.find((range) => range.id === id)
  return parent ? `${parent.lower || '(start)'} to ${parent.upper || '(end)'}` : id
}
const all = ref(false)
const rows = computed(() => (all.value ? props.ranges : props.ranges.slice(0, SHOWN)))
// A node that reports no counts or refresh times gets no columns for them.
const counted = computed(() => props.ranges.some((range) => range.objects !== undefined))
const split = computed(() => props.ranges.some((range) => range.lineage))
const refreshed = computed(() => props.ranges.some((range) => range.refreshed !== undefined))
</script>

<template>
  <div class="space-y-2">
    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[40rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Range</th>
            <th class="px-3 py-2 font-medium">Bounds</th>
            <th class="px-3 py-2 font-medium">Coordinator</th>
            <th v-if="split" class="px-3 py-2 font-medium">Split from</th>
            <th class="px-3 py-2 font-medium">Epoch</th>
            <th class="px-3 py-2 font-medium">Replicas</th>
            <template v-if="counted">
              <th class="px-3 py-2 text-right font-medium">Objects</th>
              <th class="px-3 py-2 text-right font-medium">Size</th>
            </template>
            <th v-if="refreshed" class="px-3 py-2 font-medium">Last refresh</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="range in rows" :key="range.id" :class="isDegraded(range) ? 'bg-amber-500/5' : ''">
            <td class="max-w-[10rem] truncate px-3 py-2 font-mono" :title="range.id">{{ range.id }}</td>
            <td class="px-3 py-2 font-mono">{{ range.lower || '(start)' }} to {{ range.upper || '(end)' }}</td>
            <td class="px-3 py-2">
              <NodeLabel :node-id="range.coordinator" />
              <Badge v-if="isDegraded(range)" variant="warn" size="sm" class="ml-1">unreachable</Badge>
            </td>
            <td v-if="split" class="max-w-[8rem] truncate px-3 py-2 font-mono" :title="range.lineage">{{ parentBounds(range.lineage) }}</td>
            <td class="px-3 py-2">{{ range.epoch }}</td>
            <td class="px-3 py-2">
              <template v-if="range.replicas.length">
                <NodeLabel v-for="(replica, index) in range.replicas" :key="replica" :node-id="replica" :class="index ? 'ml-2' : ''" />
              </template>
              <template v-else>none</template>
            </td>
            <template v-if="counted">
              <td class="px-3 py-2 text-right tabular-nums">{{ range.objects === undefined ? 'Unknown' : formatNumber(range.objects) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ range.bytes === undefined ? 'Unknown' : formatBytes(range.bytes) }}</td>
            </template>
            <td v-if="refreshed" class="px-3 py-2">{{ range.refreshed ? stamp(range.refreshed) : 'Unknown' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <Button v-if="ranges.length > SHOWN" variant="ghost" size="sm" @click="all = !all">
      {{ all ? 'Show fewer ranges' : `Show all ${ranges.length} ranges` }}
    </Button>
  </div>
</template>
