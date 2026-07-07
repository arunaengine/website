<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    value?: number
    max?: number
    class?: string
    barClass?: string
    warn?: number
    critical?: number
    label?: string
  }>(),
  { value: 0, max: 100, warn: 75, critical: 90 },
)

const clamped = computed(() => Math.max(0, Math.min(props.max, props.value ?? 0)))
const pct = computed(() => (clamped.value / props.max) * 100)
const tone = computed(() => {
  if (pct.value >= props.critical) return 'bg-rose-500'
  if (pct.value >= props.warn) return 'bg-amber-500'
  return 'bg-aruna-gradient'
})
</script>

<template>
  <div
    role="progressbar"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="clamped"
    :aria-label="label"
    :class="cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', props.class)"
  >
    <div
      class="h-full transition-[width] duration-700"
      :class="cn(tone, props.barClass)"
      :style="{ width: `${pct}%` }"
    />
  </div>
</template>
