<script setup lang="ts">
// The portal's small chart: bars, lines or a pie over one label axis, drawn
// in the same view box and colours as the usage history chart.
import { computed, ref } from 'vue'
import { areaPath, linePath, scale } from '@/lib/chartPaths'

export interface ChartSeries {
  name: string
  values: number[]
}

const props = defineProps<{
  kind: 'bar' | 'line' | 'pie'
  labels: string[]
  series: ChartSeries[]
}>()

const PALETTE = ['#335DC6', '#0EA5A4', '#D97706', '#7C3AED', '#DC2626', '#059669', '#64748B']
const WIDTH = 100
const HEIGHT = 40

const hover = ref<number | null>(null)

function colour(index: number): string {
  return PALETTE[index % PALETTE.length]
}

const maxValue = computed(() =>
  Math.max(0, ...props.series.flatMap((entry) => entry.values.map((value) => Math.max(value, 0)))) || 1)

// One x per label; bars share the slot, lines pass through its centre.
const slot = computed(() => WIDTH / Math.max(props.labels.length, 1))

function xCentre(index: number): number {
  return slot.value * index + slot.value / 2
}

const bars = computed(() => {
  const width = (slot.value * 0.7) / Math.max(props.series.length, 1)
  return props.series.flatMap((entry, seriesIndex) => entry.values.map((value, index) => ({
    key: `${seriesIndex}:${index}`,
    x: slot.value * index + slot.value * 0.15 + width * seriesIndex,
    y: scale(Math.max(value, 0), maxValue.value, HEIGHT, true),
    width,
    height: scale(Math.max(value, 0), maxValue.value, HEIGHT),
    fill: colour(seriesIndex),
  })))
})

const lines = computed(() => props.series.map((entry, seriesIndex) => {
  const points = entry.values.map((value, index) => ({
    x: xCentre(index),
    y: scale(Math.max(value, 0), maxValue.value, HEIGHT, true),
  }))
  return { key: seriesIndex, line: linePath(points), area: areaPath(points, HEIGHT), stroke: colour(seriesIndex), points }
}))

// A pie shows the first series; the slices are drawn as dashes on one ring.
const slices = computed(() => {
  const values = (props.series[0]?.values ?? []).map((value) => Math.max(value, 0))
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  let offset = 0
  return values.map((value, index) => {
    const share = (value / total) * 100
    const slice = { key: index, label: props.labels[index] ?? '', share, offset, fill: colour(index), value }
    offset += share
    return slice
  })
})

const format = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
</script>

<template>
  <div>
    <div v-if="kind === 'pie'" class="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 42 42" class="h-32 w-32 shrink-0" role="img" aria-label="Pie chart">
        <circle cx="21" cy="21" r="15.9" fill="none" stroke="currentColor" class="text-border" stroke-width="6" />
        <circle
          v-for="slice in slices"
          :key="slice.key"
          cx="21"
          cy="21"
          r="15.9"
          fill="none"
          :stroke="slice.fill"
          stroke-width="6"
          :stroke-dasharray="`${slice.share} ${100 - slice.share}`"
          :stroke-dashoffset="25 - slice.offset"
        />
      </svg>
      <ul class="min-w-0 flex-1 space-y-1 text-xs">
        <li v-for="slice in slices" :key="slice.key" class="flex items-center gap-2">
          <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: slice.fill }" />
          <span class="min-w-0 flex-1 truncate text-foreground">{{ slice.label }}</span>
          <span class="tabular-nums text-muted-foreground">{{ format.format(slice.value) }} · {{ slice.share.toFixed(0) }}%</span>
        </li>
      </ul>
    </div>

    <div v-else>
      <div class="flex gap-2">
        <div class="flex w-14 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-muted-foreground">
          <span>{{ format.format(maxValue) }}</span>
          <span>0</span>
        </div>
        <div class="relative flex-1" @pointerleave="hover = null">
          <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" class="h-36 w-full" role="img" :aria-label="`${kind} chart`">
            <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" class="text-border" stroke-width="1" vector-effect="non-scaling-stroke" />
            <template v-if="kind === 'bar'">
              <rect
                v-for="bar in bars"
                :key="bar.key"
                :x="bar.x"
                :y="bar.y"
                :width="bar.width"
                :height="bar.height"
                :fill="bar.fill"
                rx="0.4"
              />
            </template>
            <template v-else>
              <g v-for="entry in lines" :key="entry.key">
                <path :d="entry.area" :fill="entry.stroke" fill-opacity="0.08" />
                <path :d="entry.line" fill="none" :stroke="entry.stroke" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              </g>
            </template>
            <rect
              v-for="(label, index) in labels"
              :key="label + index"
              :x="slot * index"
              y="0"
              :width="slot"
              :height="HEIGHT"
              fill="transparent"
              @pointerenter="hover = index"
            />
          </svg>
          <div
            v-if="hover !== null"
            class="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
            :style="{ left: `${Math.min(85, Math.max(15, (xCentre(hover) / WIDTH) * 100))}%` }"
          >
            <div class="font-medium text-foreground">{{ labels[hover] }}</div>
            <div v-for="(entry, index) in series" :key="entry.name" class="flex items-center gap-1.5 tabular-nums text-muted-foreground">
              <span class="inline-block h-2 w-2 rounded-sm" :style="{ backgroundColor: colour(index) }" />
              {{ entry.name }}: {{ format.format(entry.values[hover] ?? 0) }}
            </div>
          </div>
        </div>
      </div>
      <div class="mt-1 flex justify-between pl-16 text-[10px] text-muted-foreground">
        <span>{{ labels[0] ?? '' }}</span>
        <span v-if="labels.length > 1">{{ labels[labels.length - 1] }}</span>
      </div>
      <ul v-if="series.length > 1" class="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-16 text-[11px]">
        <li v-for="(entry, index) in series" :key="entry.name" class="flex items-center gap-1.5 text-muted-foreground">
          <span class="inline-block h-2 w-2 rounded-sm" :style="{ backgroundColor: colour(index) }" />
          {{ entry.name }}
        </li>
      </ul>
    </div>
  </div>
</template>
