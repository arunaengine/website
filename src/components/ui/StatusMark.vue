<script setup lang="ts">
// A state as an icon: a green check when fine, a muted offline mark with `offline`; the word is in
// the tooltip and for assistive tech. Other states that need attention use StatusPill.
import { CircleCheck, WifiOff } from '@lucide/vue'
import Tooltip from '@/components/ui/Tooltip.vue'

withDefaults(defineProps<{ label: string; size?: 'sm' | 'md'; offline?: boolean }>(), { size: 'md' })
</script>

<template>
  <Tooltip :label="label">
    <span :class="['inline-flex shrink-0', offline ? 'text-muted-foreground' : 'text-status-ok']" role="img" :aria-label="label" tabindex="0">
      <component :is="offline ? WifiOff : CircleCheck" :class="size === 'sm' ? 'size-3.5' : 'size-4'" aria-hidden="true" />
    </span>
  </Tooltip>
</template>
