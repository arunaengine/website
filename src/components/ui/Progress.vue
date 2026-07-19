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
    indeterminate?: boolean
  }>(),
  { value: 0, max: 100, warn: 75, critical: 90 },
)

const pct = computed(() => {
  const v = Math.max(0, Math.min(props.max, props.value ?? 0))
  return (v / props.max) * 100
})
const tone = computed(() => {
  if (pct.value >= props.critical) return 'bg-rose-500'
  if (pct.value >= props.warn) return 'bg-amber-500'
  return 'bg-aruna-gradient'
})
</script>

<template>
  <div
    :class="cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', props.class)"
  >
    <div
      class="h-full transition-[width] duration-700"
      :class="cn(tone, props.indeterminate && 'animate-pulse', props.barClass)"
      :style="{ width: props.indeterminate ? '35%' : `${pct}%` }"
    />
  </div>
</template>
