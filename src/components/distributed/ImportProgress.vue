<script setup lang="ts">
// Progress of a registration, one row per source bucket and range.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import { toneVariant, type StateTone } from '@/lib/stateBadge'
import { BAKREP_COUNT, importProgress, sourceCoordinator, sourceName, sourceObjects } from '@/lib/distributedMockData'
import { formatNumber } from '@/lib/utils'

const TONES: Record<string, StateTone> = { done: 'done', running: 'progress', queued: 'idle' }
const SHOWN = 10

const rows = Array.from({ length: BAKREP_COUNT }, (_, index) => {
  const progress = importProgress(index)
  return {
    range: `r-${String(index).padStart(3, '0')}`,
    source: sourceName(index),
    coordinator: sourceCoordinator(index),
    ...progress,
    files: Math.round((sourceObjects(index) * progress.percent) / 100),
  }
})

const all = ref(false)
const shown = computed(() => (all.value ? rows : rows.slice(0, SHOWN)))
const registered = rows.reduce((sum, row) => sum + row.files, 0)
const expected = rows.reduce((sum, _row, index) => sum + sourceObjects(index), 0)
const finished = rows.filter((row) => row.state === 'done').length
</script>

<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <Progress :value="registered" :max="expected" :warn="101" :critical="101" label="Files registered" />
      <p class="text-xs text-muted-foreground">
        {{ formatNumber(registered) }} of about {{ formatNumber(expected) }} files registered.
        {{ finished }} of {{ rows.length }} ranges are done.
      </p>
    </div>
    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[44rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Range</th>
            <th class="px-3 py-2 font-medium">Source bucket</th>
            <th class="px-3 py-2 font-medium">Coordinator</th>
            <th class="w-48 px-3 py-2 font-medium">Progress</th>
            <th class="px-3 py-2 text-right font-medium">Files</th>
            <th class="px-3 py-2 font-medium">State</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="row in shown" :key="row.range">
            <td class="px-3 py-2 font-mono">{{ row.range }}</td>
            <td class="px-3 py-2 font-mono">{{ row.source }}</td>
            <td class="px-3 py-2">{{ row.coordinator }}</td>
            <td class="px-3 py-2"><Progress :value="row.percent" :warn="101" :critical="101" :label="`${row.source} progress`" /></td>
            <td class="px-3 py-2 text-right tabular-nums">{{ formatNumber(row.files) }}</td>
            <td class="px-3 py-2"><Badge :variant="toneVariant(TONES[row.state])" size="sm">{{ row.state }}</Badge></td>
          </tr>
        </tbody>
      </table>
    </div>
    <Button variant="ghost" size="sm" @click="all = !all">{{ all ? 'Show fewer ranges' : `Show all ${rows.length} ranges` }}</Button>
  </div>
</template>
