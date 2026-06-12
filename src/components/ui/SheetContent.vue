<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  type DialogContentProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background shadow-xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 scrollbar-thin overflow-y-auto',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-md',
        right:
          'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl',
      },
    },
    defaultVariants: { side: 'right' },
  },
)

const props = defineProps<DialogContentProps & { class?: string; side?: 'top' | 'bottom' | 'left' | 'right' }>()
const emits = defineEmits<{
  (e: 'closeAutoFocus', event: Event): void
  (e: 'escapeKeyDown', event: KeyboardEvent): void
  (e: 'pointerDownOutside', event: Event): void
  (e: 'interactOutside', event: Event): void
  (e: 'openAutoFocus', event: Event): void
}>()
const forwarded = useForwardPropsEmits(props, emits)
const classes = computed(() => cn(sheetVariants({ side: props.side || 'right' }), props.class))
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent v-bind="forwarded" :class="classes">
      <slot />
      <button
        class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Close"
      >
        <X class="h-4 w-4" />
      </button>
    </DialogContent>
  </DialogPortal>
</template>
