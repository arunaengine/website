<script setup lang="ts">
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'radix-vue'

defineProps<{ side?: 'top' | 'right' | 'bottom' | 'left'; align?: 'start' | 'center' | 'end' }>()
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
        class="z-50 w-72 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
      >
        <slot name="content" />
        <PopoverArrow class="fill-aruna-navy" :width="10" :height="4" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
