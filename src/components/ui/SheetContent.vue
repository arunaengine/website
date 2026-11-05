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
import { cva } from 'class-variance-authority'
import { X } from '@lucide/vue'
import { allowAssistantFocus, insideFloatingLayer } from '@/components/ui/layers'
import { cn } from '@/lib/utils'

// A right sheet is 480 px for files and 640 px for runs (`size`); the rest keep their own widths.
const sheetVariants = cva(
  'fixed z-[var(--z-modal)] gap-4 bg-background shadow-xl outline-none transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 scrollbar-thin overflow-y-auto [overflow-wrap:anywhere]',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 max-h-[100dvh] border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 max-h-[100dvh] border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-md',
        right:
          'inset-y-0 right-0 h-full w-3/4 border-l border-border-subtle data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl',
      },
      size: {
        default: '',
        md: 'w-full sm:max-w-[480px]',
        lg: 'w-full sm:max-w-[640px]',
      },
    },
    defaultVariants: { side: 'right', size: 'default' },
  },
)

const props = defineProps<DialogContentProps & { class?: string; side?: 'top' | 'bottom' | 'left' | 'right'; size?: 'md' | 'lg' }>()
const emits = defineEmits<{
  (e: 'closeAutoFocus', event: Event): void
  (e: 'escapeKeyDown', event: KeyboardEvent): void
  (e: 'pointerDownOutside', event: Event): void
  (e: 'interactOutside', event: Event): void
  (e: 'openAutoFocus', event: Event): void
}>()
const forwarded = useForwardPropsEmits(props, emits)
const classes = computed(() => cn(sheetVariants({ side: props.side || 'right', size: props.size ?? 'default' }), props.class))

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
      <!-- The focus ring shows for the keyboard only, not for the focus a sheet takes on open. -->
      <DialogClose
        class="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Close"
      >
        <X class="size-4" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
