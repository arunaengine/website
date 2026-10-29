<script setup lang="ts">
// A state that is fine: a green check, with the word in the tooltip and for assistive tech.
// States that need attention use StatusPill instead.
import { CircleCheck } from '@lucide/vue'
import Tooltip from '@/components/ui/Tooltip.vue'

withDefaults(defineProps<{ label: string; size?: 'sm' | 'md' }>(), { size: 'md' })
</script>

<template>
  <Tooltip :label="label">
    <span class="inline-flex shrink-0 text-status-ok" role="img" :aria-label="label" tabindex="0">
      <CircleCheck :class="size === 'sm' ? 'size-3.5' : 'size-4'" aria-hidden="true" />
    </span>
  </Tooltip>
</template>
