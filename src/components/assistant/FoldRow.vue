<script setup lang="ts">
// The folded row the chat uses for its machinery: tool calls and background
// updates. The icon and any badges come from the caller.
import { ChevronRight } from '@lucide/vue'

defineProps<{ open: boolean; label: string }>()
defineEmits<{ (e: 'toggle'): void }>()
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-left text-[11px]"
    :aria-expanded="open"
    @click="$emit('toggle')"
  >
    <ChevronRight :class="['size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90']" />
    <slot name="icon" />
    <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ label }}</span>
    <span class="flex shrink-0 items-center gap-1"><slot /></span>
  </button>
</template>
