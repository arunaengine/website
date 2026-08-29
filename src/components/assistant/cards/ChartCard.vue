<script setup lang="ts">
import MiniChart from '@/components/ui/MiniChart.vue'
import type { ChartKind } from '@/lib/assistant/types'
import { BarChart3 } from '@lucide/vue'

defineProps<{
  title: string
  chart: ChartKind
  labels: string[]
  series: Array<{ name: string; values: number[] }>
}>()
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <BarChart3 class="h-3.5 w-3.5 shrink-0 text-primary" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ title }}</span>
      <span class="text-[11px] capitalize text-muted-foreground">{{ chart }}</span>
    </div>
    <div class="px-3 py-3">
      <MiniChart :kind="chart" :labels="labels" :series="series" />
    </div>
  </div>
</template>
