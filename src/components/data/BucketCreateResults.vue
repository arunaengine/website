<script setup lang="ts">
// One create result per chosen node, in the create flow. A failed node can be retried or dropped.
import { ref, watch } from 'vue'
import CreateResults from '@/components/distributed/CreateResults.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import { firstResults, retryResult, type MemberResult, type Placement } from '@/lib/distributedMock'

const props = defineProps<{ open: boolean; name: string; placement: Placement }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const results = ref<MemberResult[]>([])

watch(
  () => props.open,
  (open) => {
    if (open) results.value = firstResults(props.placement.members)
  },
  { immediate: true },
)

function retry(nodeId: string) {
  results.value = results.value.map((item) => (item.nodeId === nodeId ? retryResult(item) : item))
}

function drop(nodeId: string) {
  results.value = results.value.filter((item) => item.nodeId !== nodeId)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-3xl">
      <CreateResults :name="name" :results="results" @retry="retry" @drop="drop" @done="emit('update:open', false)" />
    </DialogContent>
  </Dialog>
</template>
