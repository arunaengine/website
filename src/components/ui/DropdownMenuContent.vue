<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  type DropdownMenuContentProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuContentProps & { class?: string }>()
const emits = defineEmits<{
  (e: 'escapeKeyDown', event: KeyboardEvent): void
  (e: 'pointerDownOutside', event: Event): void
  (e: 'focusOutside', event: Event): void
  (e: 'interactOutside', event: Event): void
}>()
const forwarded = useForwardPropsEmits(props, emits)
const classes = computed(() =>
  cn(
    'z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    props.class,
  ),
)
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuContent v-bind="forwarded" :class="classes" :side-offset="props.sideOffset ?? 4">
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>
