<script setup lang="ts">
// Key ranges of one bucket stored on several nodes. A long list shows the first rows and a button for the rest.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { stamp } from '@/lib/distributedMock'
import type { MockRange } from '@/lib/distributedMockData'
import { formatBytes, formatNumber } from '@/lib/utils'

const props = defineProps<{ ranges: MockRange[] }>()

const SHOWN = 8
const all = ref(false)
const rows = computed(() => (all.value ? props.ranges : props.ranges.slice(0, SHOWN)))
</script>

<template>
  <div class="space-y-2">
    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[60rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Range</th>
            <th class="px-3 py-2 font-medium">Bounds</th>
            <th class="px-3 py-2 font-medium">Coordinator</th>
            <th class="px-3 py-2 font-medium">Epoch</th>
            <th class="px-3 py-2 font-medium">Replicas</th>
            <th class="px-3 py-2 text-right font-medium">Objects</th>
            <th class="px-3 py-2 text-right font-medium">Size</th>
            <th class="px-3 py-2 font-medium">Last refresh</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="range in rows" :key="range.id" :class="range.degradedSince ? 'bg-amber-500/5' : ''">
            <td class="px-3 py-2 font-mono">{{ range.id }}</td>
            <td class="px-3 py-2 font-mono">{{ range.lower || '(start)' }} to {{ range.upper || '(end)' }}</td>
            <td class="px-3 py-2">
              {{ range.coordinator }}
              <Badge v-if="range.degradedSince" variant="warn" size="sm" class="ml-1">unreachable</Badge>
            </td>
            <td class="px-3 py-2">{{ range.epoch }}</td>
            <td class="px-3 py-2">{{ range.replicas.join(', ') || 'none' }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ formatNumber(range.objects) }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ formatBytes(range.bytes) }}</td>
            <td class="px-3 py-2">{{ stamp(range.refreshed) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <Button v-if="ranges.length > SHOWN" variant="ghost" size="sm" @click="all = !all">
      {{ all ? 'Show fewer ranges' : `Show all ${ranges.length} ranges` }}
    </Button>
  </div>
</template>
