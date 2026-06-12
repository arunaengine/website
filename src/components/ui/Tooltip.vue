<script setup lang="ts">
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'radix-vue'

defineProps<{ label?: string; side?: 'top' | 'right' | 'bottom' | 'left' }>()
</script>

<template>
  <TooltipProvider :delay-duration="120">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side || 'top'"
          :side-offset="6"
          class="z-50 overflow-hidden rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <slot name="content">{{ label }}</slot>
          <TooltipArrow class="fill-aruna-navy" :width="10" :height="4" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
