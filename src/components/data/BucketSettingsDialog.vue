<script setup lang="ts">
// One entry for everything configured per bucket. Sections appear only when
// the caller says the viewer may see them; a single visible section still
// opens here rather than getting its own toolbar button.
import BucketRoutingSection from '@/components/data/BucketRoutingSection.vue'
import BucketPlacementSection from '@/components/placement/BucketPlacementSection.vue'
import Button from '@/components/ui/Button.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { MapPinned, Route, Settings } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  bucket: string
  groupId: string | null
  showRouting: boolean
  showPlacement: boolean
}>()
const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>()
</script>

<template>
  <DetailDialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <template #header>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Settings class="h-4 w-4 text-primary" /> Bucket settings for {{ props.bucket }}
        </DialogTitle>
        <DialogDescription>
          Where the writes of this bucket land, and where copies of its data are kept.
        </DialogDescription>
      </DialogHeader>
    </template>

    <div class="space-y-8">
      <section v-if="props.showRouting" class="space-y-3">
        <div>
          <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Route class="h-4 w-4 text-primary" /> Routing
          </h3>
          <p class="mt-1 text-xs text-muted-foreground">
            Which storage backend behind this node receives the bucket's writes. Files already in
            the bucket stay where they are.
          </p>
        </div>
        <BucketRoutingSection :open="props.open" :bucket="props.bucket" :group-id="props.groupId" />
      </section>

      <section v-if="props.showPlacement" class="space-y-3" :class="props.showRouting ? 'border-t border-border pt-6' : ''">
        <div>
          <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPinned class="h-4 w-4 text-primary" /> Placement
          </h3>
          <p class="mt-1 text-xs text-muted-foreground">
            Where copies of this bucket's data are kept.
          </p>
        </div>
        <BucketPlacementSection :open="props.open" :bucket="props.bucket" />
      </section>
    </div>

    <template #footer>
      <DialogFooter>
        <DialogClose as-child><Button type="button" variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </template>
  </DetailDialog>
</template>
