<script setup lang="ts">
// Deleting a bucket stored on more nodes removes it everywhere. Writes stop at once; the nodes
// delete their own buckets after every coordinator has fenced its ranges.
import { ref } from 'vue'
import DeletionNotice from '@/components/distributed/DeletionNotice.vue'
import SetDeleteDialog from '@/components/distributed/SetDeleteDialog.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import type { DistributedBucket } from '@/lib/distribution'
import { Trash2 } from '@lucide/vue'

// `bare`: inside a section that already names it, without its own card and title.
defineProps<{ bucket: DistributedBucket; admin: boolean; bare?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const open = ref(false)
// The node took the deletion; the bucket state may name it only a moment later.
const requested = ref(false)
function deleted() {
  requested.value = true
  emit('changed')
}
</script>

<template>
  <section :class="bare ? 'border-t border-border' : 'surface'">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <template v-if="!bare">
        <Trash2 class="size-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Delete bucket</h2>
      </template>
      <Button
        v-if="admin && !bucket.live?.deletion && !requested"
        variant="destructive"
        size="sm"
        class="ml-auto"
        @click="open = true"
      >
        <Trash2 class="h-3.5 w-3.5" /> Delete bucket
      </Button>
    </header>
    <div class="px-5 py-4 text-sm text-muted-foreground">
      <DeletionNotice v-if="bucket.live?.deletion" :deletion="bucket.live.deletion" />
      <Notice v-else-if="requested" tone="warning" title="Deleting">Writes have stopped. Every node deletes its bucket, which can take a minute.</Notice>
      <p v-else-if="admin">Removes the bucket and all its files on every node.</p>
      <p v-else>Only group admins can delete this bucket.</p>
    </div>
    <SetDeleteDialog v-model:open="open" :bucket="bucket" @changed="deleted" />
  </section>
</template>
