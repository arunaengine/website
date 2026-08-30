<script setup lang="ts">
// The app's single detail-view idiom: a large centered modal used by object
// previews and the run and system job detail views (side sheets are retired).
// The header and footer stay put; the default slot is the only scroller, so the
// close button never sits on top of a scrollbar.
import Dialog from './Dialog.vue'
import DialogClose from './DialogClose.vue'
import DialogContent from './DialogContent.vue'
import { X } from '@lucide/vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent
      hide-close
      class="flex h-[88dvh] w-[calc(100%-2rem)] max-w-6xl flex-col gap-0 overflow-hidden bg-background p-0 sm:w-[92vw]"
    >
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div class="min-w-0 flex-1"><slot name="header" /></div>
        <DialogClose
          class="mt-0.5 shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Close"
        >
          <X class="h-4 w-4" />
        </DialogClose>
      </div>

      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5"><slot /></div>

      <div v-if="$slots.footer" class="shrink-0 border-t border-border px-6 py-3"><slot name="footer" /></div>
    </DialogContent>
  </Dialog>
</template>
