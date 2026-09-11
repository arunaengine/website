<script setup lang="ts">
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'radix-vue'
import { insideFloatingLayer } from '@/components/ui/layers'

const props = defineProps<{
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Set inside the assistant panel, which floats above the modal layer. */
  raised?: boolean
}>()

function keepOpen(event: Event) {
  if (insideFloatingLayer(event)) event.preventDefault()
}
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <slot />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side || 'bottom'"
        :align="align || 'start'"
        :side-offset="6"
        class="w-72 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        :class="props.raised ? 'z-[var(--z-assistant-modal)]' : 'z-50'"
        @pointer-down-outside="keepOpen"
        @focus-outside="keepOpen"
      >
        <slot name="content" />
        <PopoverArrow class="fill-aruna-navy" :width="10" :height="4" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
