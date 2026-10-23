<script setup lang="ts">
// Deleting the bucket from its settings page, through the one delete dialog.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import DeleteDialog from '@/components/data/DeleteDialog.vue'
import SetDeleteDialog from '@/components/distributed/SetDeleteDialog.vue'
import Button from '@/components/ui/Button.vue'
import { useBuckets } from '@/composables/useBuckets'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { useS3 } from '@/composables/useS3'
import { mockEnabled } from '@/lib/distributedMock'
import { mockBucket } from '@/lib/distributedMockData'
import type { DeleteRequest, DeletionResult } from '@/lib/deletion/request'
import { Trash2 } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; groupId: string | null }>()

const router = useRouter()
const s3 = useS3()
const bucketList = useBuckets()
const shortcuts = useBucketShortcuts()
const request = ref<DeleteRequest | null>(null)
// An example bucket of the node mock deletes through its preview.
const example = computed(() => (mockEnabled() ? mockBucket(props.bucket) : undefined))
const previewOpen = ref(false)
const previewResult = ref('')

const refusal = computed(() => {
  if (example.value) return null
  if (props.nodeId) return 'Only the node that serves this bucket can delete it.'
  if (!s3.canDeletePrefix(props.bucket, '', null)) {
    return 'This session cannot delete this bucket: it needs write on the whole bucket.'
  }
  return null
})

async function onCompleted(result: DeletionResult) {
  if (!result.committed.length) return
  shortcuts.remove(props.bucket, props.nodeId)
  await bucketList.refresh()
  await router.push({ name: 'buckets', query: props.groupId ? { group: props.groupId } : {} })
}
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Trash2 class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Delete bucket</h2>
      <Button
        variant="outline"
        size="sm"
        class="ml-auto text-destructive hover:text-destructive"
        :disabled="Boolean(refusal)"
        :title="refusal ?? undefined"
        @click="example ? (previewOpen = true) : (request = { kind: 'bucket', bucket, nodeId, option: 'delete-permanently' })"
      >
        Delete permanently…
      </Button>
      <Button
        variant="destructive"
        size="sm"
        :disabled="Boolean(refusal)"
        :title="refusal ?? undefined"
        @click="example ? (previewOpen = true) : (request = { kind: 'bucket', bucket, nodeId })"
      >
        <Trash2 class="h-3.5 w-3.5" /> Delete bucket
      </Button>
    </header>
    <p class="px-5 py-4 text-sm text-muted-foreground">
      {{ previewResult || (refusal ?? (example ? 'Removes the bucket and all its files on every node.' : 'Removes the bucket and all its files.')) }}
    </p>
    <DeleteDialog :request="request" @close="request = null" @completed="onCompleted" />
    <SetDeleteDialog v-if="example" v-model:open="previewOpen" :bucket="example" @done="previewResult = `Mock, nothing changed: ${$event}`" />
  </section>
</template>
