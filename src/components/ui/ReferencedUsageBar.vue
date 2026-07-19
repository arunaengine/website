<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{ referenced: number; stored: number; compact?: boolean }>()
const footprint = computed(() => Math.max(1, props.referenced + props.stored))
const width = computed(() => Math.min(100, (props.referenced / footprint.value) * 100))
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2 text-[11px]">
      <span class="font-medium text-muted-foreground">Referenced <span class="font-normal">· not quota-counted</span></span>
      <span class="shrink-0 tabular-nums text-foreground/80">{{ formatBytes(referenced) }}</span>
    </div>
    <div
      class="relative w-full overflow-hidden rounded-full bg-muted"
      :class="compact ? 'h-1' : 'h-1.5'"
      role="meter"
      aria-label="Referenced data, not quota-counted"
      :aria-valuenow="referenced"
      :aria-valuemin="0"
      :aria-valuemax="footprint"
    >
      <span class="absolute inset-y-0 left-0 rounded-full bg-slate-400/70" :style="{ width: `${width}%` }" />
    </div>
  </div>
</template>
