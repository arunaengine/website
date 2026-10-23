<script setup lang="ts">
// Asks before a folder stops syncing, and says plainly what stays: the files
// on this computer, and Aruna's own copies.
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Spinner from '@/components/ui/Spinner.vue'

defineProps<{ open: boolean; name: string; bucket: string; sending: number; busy: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'confirm'): void }>()
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Stop syncing "{{ name }}"?</DialogTitle>
        <DialogDescription>The folder is no longer linked to Aruna.</DialogDescription>
      </DialogHeader>
      <ul class="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li><span class="font-medium text-foreground">Your files stay on this computer</span>, exactly where they are.</li>
        <li>Aruna keeps its copies in <span class="font-mono text-foreground">{{ bucket }}</span>.</li>
        <li v-if="sending > 0">
          {{ sending }} {{ sending === 1 ? 'file that is' : 'files that are' }} still sending will not finish.
        </li>
        <li>You can sync the folder again later.</li>
      </ul>
      <DialogFooter>
        <DialogClose as-child><Button variant="ghost">Keep syncing</Button></DialogClose>
        <Button variant="destructive" :disabled="busy" @click="emit('confirm')">
          <Spinner v-if="busy" label="Stopping the sync…" /> Stop syncing
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
