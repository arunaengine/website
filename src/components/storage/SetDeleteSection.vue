<script setup lang="ts">
// Deleting a bucket stored on more nodes removes it everywhere. Writes stop at once; the nodes
// delete their own buckets after every coordinator has fenced its ranges.
import { ref } from 'vue'
import DeletionNotice from '@/components/distributed/DeletionNotice.vue'
import SetDeleteDialog from '@/components/distributed/SetDeleteDialog.vue'
import Button from '@/components/ui/Button.vue'
import type { DistributedBucket } from '@/lib/distribution'
import { Trash2 } from '@lucide/vue'

defineProps<{ bucket: DistributedBucket; admin: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const open = ref(false)
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Trash2 class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Delete bucket</h2>
      <Button
        v-if="admin && !bucket.live?.deletion"
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
      <p v-else-if="admin">Removes the bucket and all its files on every node.</p>
      <p v-else>Only group admins can delete this bucket.</p>
    </div>
    <SetDeleteDialog v-model:open="open" :bucket="bucket" @changed="emit('changed')" />
  </section>
</template>
