<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  type DialogContentProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { allowAssistantFocus, insideFloatingLayer } from '@/components/ui/layers'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button'

const props = defineProps<DialogContentProps & { class?: string; hideClose?: boolean }>()
const emits = defineEmits<{
  (e: 'closeAutoFocus', event: Event): void
  (e: 'escapeKeyDown', event: KeyboardEvent): void
  (e: 'pointerDownOutside', event: Event): void
  (e: 'focusOutside', event: Event): void
  (e: 'interactOutside', event: Event): void
  (e: 'openAutoFocus', event: Event): void
}>()
const forwarded = useForwardPropsEmits(props, emits)
// Dialogs never hide information: long values wrap and truncated text (outside buttons) wraps too.
const classes = computed(() =>
  cn(
    'fixed left-1/2 top-1/2 z-[var(--z-modal)] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 grid-cols-[minmax(0,1fr)] gap-4 overflow-auto border bg-popover p-6 shadow-xl duration-200 [--dialog-surface:hsl(var(--popover))] [overflow-wrap:anywhere] [&_.truncate:not(button_*)]:whitespace-normal sm:rounded-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
    props.class,
  ),
)

function keepOpen(event: Event) {
  if (insideFloatingLayer(event)) event.preventDefault()
}

allowAssistantFocus()
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-[var(--z-modal)] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      v-bind="forwarded"
      :class="classes"
      @pointer-down-outside="keepOpen"
      @focus-outside="keepOpen"
    >
      <slot />
      <DialogClose
        v-if="!hideClose"
        :class="cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'absolute right-4 top-4')"
        aria-label="Close"
      >
        <X class="size-4" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
