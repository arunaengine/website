<script setup lang="ts">
// The app's single detail-view idiom: a large centered modal used by object
// previews and the run and system job detail views (side sheets are retired).
import Dialog from './Dialog.vue'
import DialogContent from './DialogContent.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="flex h-[88dvh] w-[calc(100%-2rem)] max-w-6xl flex-col gap-0 overflow-hidden bg-background p-6 sm:w-[92vw]">
      <slot />
    </DialogContent>
  </Dialog>
</template>
