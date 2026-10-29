<script setup lang="ts">
// Names the parts of a storage bar with short swatches in the bar's own colors.
import { QUOTA_BAR_COLORS } from '@/lib/quota'

withDefaults(defineProps<{ quota?: boolean; tone?: string }>(), { quota: false, tone: QUOTA_BAR_COLORS.counted })
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
    <span class="inline-flex items-center gap-1.5">
      <span class="inline-block h-1.5 w-3 rounded-full" :style="{ backgroundColor: tone }" />
      Stored, counts against quotas
    </span>
    <span class="inline-flex items-center gap-1.5">
      <span class="inline-block h-1.5 w-3 rounded-full" :style="{ backgroundColor: QUOTA_BAR_COLORS.referenced }" />
      Referenced, not counted
    </span>
    <span v-if="quota" class="inline-flex items-center gap-1.5">
      <span class="inline-block h-2.5 w-0.5 bg-foreground/50" />
      Quota
    </span>
  </div>
</template>
