<script setup lang="ts">
// The app's single detail-view idiom: a large centered modal used by object
// previews and the run and system job detail views (side sheets are retired).
// The header and footer stay put; the default slot is the only scroller, so the
// close button never sits on top of a scrollbar.
import { computed } from 'vue'
import Dialog from './Dialog.vue'
import DialogClose from './DialogClose.vue'
import DialogContent from './DialogContent.vue'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button'
import { X } from '@lucide/vue'

/** `contentClass` only carries layering; `fit` lets a short view take only the height it needs. */
const props = defineProps<{ open: boolean; contentClass?: string; fit?: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

function focusSelf(event: Event) {
  event.preventDefault()
  ;(event.target as HTMLElement | null)?.focus?.()
}

const classes = computed(() => cn(
  'flex w-[calc(100%-2rem)] max-w-6xl flex-col gap-0 overflow-hidden bg-background p-0 [--dialog-surface:hsl(var(--background))] sm:w-[92vw]',
  props.fit ? 'max-h-[88dvh]' : 'h-[88dvh]',
  props.contentClass,
))
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <!-- Focus goes to the dialog itself on open, so no button shows a focus ring unasked. -->
    <DialogContent hide-close :class="classes" @open-auto-focus="focusSelf">
      <div class="flex shrink-0 items-start justify-between gap-2 border-b border-border px-6 py-4">
        <div class="min-w-0 flex-1 pr-1"><slot name="header" /></div>
        <div v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-2"><slot name="actions" /></div>
        <DialogClose :class="cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'shrink-0')" aria-label="Close">
          <X class="size-4" />
        </DialogClose>
      </div>

      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5"><slot /></div>

      <div v-if="$slots.footer" class="shrink-0 border-t border-border px-6 py-3"><slot name="footer" /></div>
    </DialogContent>
  </Dialog>
</template>
