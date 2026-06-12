<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    used: number
    quota: number
    color?: string
    compact?: boolean
    showLabels?: boolean
    label?: string
  }>(),
  { showLabels: true, color: '#335DC6' },
)

const pct = computed(() => (props.quota === 0 ? 0 : (props.used / props.quota) * 100))
const tone = computed(() => {
  if (pct.value > 90) return '#DC2626'
  if (pct.value > 75) return '#D97706'
  return props.color
})
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <div
      v-if="showLabels"
      class="flex items-center justify-between text-[11px]"
    >
      <span class="font-medium text-muted-foreground">{{ label ?? 'Storage' }}</span>
      <span class="tabular-nums text-foreground/80">
        {{ formatBytes(used) }} <span class="text-muted-foreground">of</span>
        {{ formatBytes(quota) }}
        <span class="ml-1 text-muted-foreground">({{ pct.toFixed(0) }}%)</span>
      </span>
    </div>
    <div
      :class="[
        'relative w-full overflow-hidden rounded-full bg-muted',
        compact ? 'h-1' : 'h-1.5',
      ]"
    >
      <span
        class="absolute inset-y-0 left-0 rounded-full transition-all"
        :style="{ width: `${Math.min(100, pct)}%`, backgroundColor: tone }"
      />
    </div>
  </div>
</template>
