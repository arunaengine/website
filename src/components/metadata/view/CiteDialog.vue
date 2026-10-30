<script setup lang="ts">
// How to cite the dataset: one line from its authors, year, title, publisher and DOI or address.
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'

defineProps<{ open: boolean; citation: string }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Cite this dataset</DialogTitle>
        <DialogDescription>Built from the dataset's metadata.</DialogDescription>
      </DialogHeader>
      <div class="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
        <p class="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{{ citation }}</p>
        <CopyButton :value="citation" label="Copy the citation" />
      </div>
      <DialogFooter>
        <DialogClose as-child><Button variant="outline" size="sm">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
