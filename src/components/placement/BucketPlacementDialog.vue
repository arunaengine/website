<script setup lang="ts">
// The realm-admin bucket inspector: the same placement section the bucket
// settings cogwheel shows, opened for an arbitrary bucket name.
import BucketPlacementSection from '@/components/placement/BucketPlacementSection.vue'
import Button from '@/components/ui/Button.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { MapPinned } from '@lucide/vue'

const props = defineProps<{ open: boolean; bucket: string }>()
const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>()
</script>

<template>
  <DetailDialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <template #header>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <MapPinned class="h-4 w-4 text-primary" /> Placement for {{ props.bucket }}
        </DialogTitle>
        <DialogDescription>Where copies of this bucket's data are kept.</DialogDescription>
      </DialogHeader>
    </template>

    <BucketPlacementSection :open="props.open" :bucket="props.bucket" />

    <template #footer>
      <DialogFooter>
        <DialogClose as-child><Button type="button" variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </template>
  </DetailDialog>
</template>
