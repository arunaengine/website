<script setup lang="ts">
import { computed, ref } from 'vue'
import { QUOTA_STATE_BADGES, assessQuota } from '@/lib/quota'
import { formatBytes } from '@/lib/utils'
import { areaPath as areaOf, linePath as lineOf } from '@/lib/chartPaths'
import type { UsageHistoryPoint } from '@/lib/api'

const props = defineProps<{
  points: UsageHistoryPoint[]
  quotaBytes?: number | null
  ceilingBytes?: number | null
}>()

// Logical bytes is the quota-counted metric; parse, drop NaNs, sort ascending.
const series = computed(() =>
  props.points
    .map((point) => ({ t: Date.parse(point.timestamp), v: point.totals.logical_bytes, point }))
    .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.v))
    .sort((a, b) => a.t - b.t),
)

const tMin = computed(() => series.value[0]?.t ?? 0)
const tMax = computed(() => series.value[series.value.length - 1]?.t ?? 0)
const yMax = computed(() => {
  const maxV = series.value.reduce((max, d) => Math.max(max, d.v), 0)
  return Math.max(maxV, props.quotaBytes ?? 0, props.ceilingBytes ?? 0) * 1.05 || 1
})

// viewBox is 0..100 x 0..40; x maps to % of width, y is inverted (0 at top).
function xFor(t: number): number {
  const span = tMax.value - tMin.value
  return span === 0 ? 0 : ((t - tMin.value) / span) * 100
}
function yFor(v: number): number {
  return 40 - (v / yMax.value) * 40
}
// SVG y (0..40) as a % of the plot height for HTML overlays.
function topPctForValue(v: number): number {
  return (yFor(v) / 40) * 100
}

const points = computed(() => series.value.map((d) => ({ x: xFor(d.t), y: yFor(d.v) })))
const linePath = computed(() => lineOf(points.value))
const areaPath = computed(() => areaOf(points.value, 40))

function refWithinDomain(value: number | null | undefined): number | null {
  return value != null && value >= 0 && value <= yMax.value ? value : null
}
const quotaRef = computed(() => refWithinDomain(props.quotaBytes))
const ceilingRef = computed(() => refWithinDomain(props.ceilingBytes))

const hoverIndex = ref<number | null>(null)
const hoverPoint = computed(() => (hoverIndex.value == null ? null : series.value[hoverIndex.value] ?? null))

function onPointerMove(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!rect.width) return
  const targetX = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))
  let best = 0
  let bestDist = Infinity
  series.value.forEach((d, i) => {
    const dist = Math.abs(xFor(d.t) - targetX)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  })
  hoverIndex.value = best
}

function stepHover(delta: number) {
  const n = series.value.length
  if (!n) return
  const cur = hoverIndex.value ?? n - 1
  hoverIndex.value = Math.min(n - 1, Math.max(0, cur + delta))
}

function pointBadge(point: UsageHistoryPoint) {
  return QUOTA_STATE_BADGES[assessQuota(point.quota, point.totals.logical_bytes).state]
}
function pointState(point: UsageHistoryPoint): string {
  return pointBadge(point)?.label ?? assessQuota(point.quota, point.totals.logical_bytes).state
}

const firstDate = computed(() => (series.value.length ? new Date(tMin.value).toLocaleDateString() : ''))
const lastDate = computed(() => (series.value.length ? new Date(tMax.value).toLocaleDateString() : ''))
const ariaLabel = computed(
  () => `Storage usage history, ${series.value.length} snapshots from ${firstDate.value} to ${lastDate.value}`,
)
// Keep the tooltip within the plot: clamp its centre and translate by -50%.
const tooltipLeft = computed(() => (hoverPoint.value ? Math.min(85, Math.max(15, xFor(hoverPoint.value.t))) : 0))
</script>

<template>
  <div>
    <div class="flex gap-2">
      <div class="flex w-16 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-muted-foreground">
        <span>{{ formatBytes(yMax) }}</span>
        <span>0</span>
      </div>
      <div
        class="relative flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabindex="0"
        role="img"
        :aria-label="ariaLabel"
        @pointermove="onPointerMove"
        @pointerleave="hoverIndex = null"
        @keydown.left.prevent="stepHover(-1)"
        @keydown.right.prevent="stepHover(1)"
        @focus="hoverIndex = series.length - 1"
        @blur="hoverIndex = null"
      >
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="h-36 w-full">
          <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" class="text-border" stroke-width="1" vector-effect="non-scaling-stroke" />
          <path :d="areaPath" fill="#335DC6" fill-opacity="0.1" />
          <path :d="linePath" fill="none" stroke="#335DC6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          <line v-if="quotaRef != null" x1="0" :y1="yFor(quotaRef)" x2="100" :y2="yFor(quotaRef)" stroke="#D97706" stroke-width="1" opacity="0.8" vector-effect="non-scaling-stroke" />
          <line v-if="ceilingRef != null" x1="0" :y1="yFor(ceilingRef)" x2="100" :y2="yFor(ceilingRef)" stroke="#DC2626" stroke-width="1" opacity="0.8" vector-effect="non-scaling-stroke" />
          <line v-if="hoverPoint" :x1="xFor(hoverPoint.t)" :x2="xFor(hoverPoint.t)" y1="0" y2="40" stroke="currentColor" class="text-border" stroke-width="1" vector-effect="non-scaling-stroke" />
        </svg>

        <div
          v-if="quotaRef != null"
          class="pointer-events-none absolute right-1 flex -translate-y-1/2 items-center gap-1"
          :style="{ top: `${topPctForValue(quotaRef)}%` }"
        >
          <span class="inline-block h-0.5 w-2" style="background-color: #d97706" />
          <span class="text-[10px] text-muted-foreground">Quota · {{ formatBytes(quotaRef) }}</span>
        </div>
        <div
          v-if="ceilingRef != null"
          class="pointer-events-none absolute right-1 flex -translate-y-1/2 items-center gap-1"
          :style="{ top: `${topPctForValue(ceilingRef)}%` }"
        >
          <span class="inline-block h-0.5 w-2" style="background-color: #dc2626" />
          <span class="text-[10px] text-muted-foreground">Hard cap · {{ formatBytes(ceilingRef) }}</span>
        </div>

        <span
          v-if="hoverPoint"
          class="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
          :style="{ left: `${xFor(hoverPoint.t)}%`, top: `${topPctForValue(hoverPoint.v)}%`, backgroundColor: '#335DC6' }"
        />
        <div
          v-if="hoverPoint"
          class="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
          :style="{ left: `${tooltipLeft}%` }"
        >
          <div class="font-medium text-foreground tabular-nums">{{ formatBytes(hoverPoint.v) }}</div>
          <div class="text-[10px] text-muted-foreground">{{ new Date(hoverPoint.t).toLocaleString() }}</div>
          <div v-if="pointBadge(hoverPoint.point)" class="mt-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            {{ pointBadge(hoverPoint.point)!.label }}
          </div>
        </div>
      </div>
    </div>

    <div class="mt-1 flex justify-between pl-[4.5rem] text-[10px] text-muted-foreground">
      <span>{{ firstDate }}</span>
      <span>{{ lastDate }}</span>
    </div>

    <details class="mt-2">
      <summary class="cursor-pointer text-[11px] text-muted-foreground">View as table</summary>
      <div class="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
        <table class="w-full text-xs">
          <thead class="sticky top-0 bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-2 py-1 text-left font-semibold">Timestamp</th>
              <th class="px-2 py-1 text-right font-semibold">Logical bytes</th>
              <th class="px-2 py-1 text-left font-semibold">State</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in series" :key="d.t" class="border-t border-border">
              <td class="px-2 py-1 text-muted-foreground">{{ new Date(d.t).toLocaleString() }}</td>
              <td class="px-2 py-1 text-right tabular-nums text-foreground/80">{{ formatBytes(d.v) }}</td>
              <td class="px-2 py-1 text-muted-foreground">{{ pointState(d.point) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>
