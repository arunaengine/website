<script setup lang="ts">
// Bucket deletion has exactly one home: the danger zone of the bucket's
// Storage overview, which carries the heading and the warning. It always goes
// through the shared delete dialog.
import Button from '@/components/ui/Button.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import DeleteDialog from '@/components/data/DeleteDialog.vue'
import { useS3 } from '@/composables/useS3'
import type { DeleteRequest, DeletionResult } from '@/lib/deletion/request'
import { computed, ref } from 'vue'
import { Trash2 } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId?: string | null }>()
const emit = defineEmits<{ (e: 'deleted', result: DeletionResult): void }>()

const s3 = useS3()
const request = ref<DeleteRequest | null>(null)

const reason = computed(() => {
  if (props.nodeId) {
    return 'This bucket is served by another node.\nOnly that node can delete it; open the bucket there.'
  }
  if (!s3.canDeletePrefix(props.bucket, '', null)) {
    return 'This session cannot delete this bucket.\nIt needs a write permission covering the whole bucket.'
  }
  return null
})

function open() {
  if (reason.value) return
  request.value = { kind: 'bucket', bucket: props.bucket, nodeId: props.nodeId ?? null }
}
</script>

<template>
  <div class="space-y-3">
    <RefusalNote v-if="reason" tone="warning" :message="reason" />
    <Button variant="destructive" size="sm" :disabled="Boolean(reason)" @click="open">
      <Trash2 class="h-4 w-4" /> Delete bucket permanently…
    </Button>

    <DeleteDialog
      :request="request"
      @close="request = null"
      @completed="(result: DeletionResult) => emit('deleted', result)"
    />
  </div>
</template>
