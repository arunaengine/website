<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { cn } from '@/lib/utils'

// Announced in-flight marker: the label is always read by assistive tech and
// rendered next to the icon when `showLabel` is set. The region it refreshes
// carries `aria-busy`.
const props = withDefaults(defineProps<{ label?: string; showLabel?: boolean; class?: string }>(), {
  label: 'Loading…',
  showLabel: false,
  class: undefined,
})
</script>

<template>
  <span
    role="status"
    aria-live="polite"
    :class="cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', props.class)"
  >
    <Loader2 class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
    <span :class="props.showLabel ? '' : 'sr-only'">{{ props.label }}</span>
  </span>
</template>
