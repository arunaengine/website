<script setup lang="ts">
// Creates a bucket on several nodes and shows one result per node. A pending bucket can retry its admissions.
import { ref, watch } from 'vue'
import CreateResults from '@/components/distributed/CreateResults.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, type AdmissionResponse } from '@/lib/api'
import type { Placement } from '@/lib/distributedMock'
import { createRequest } from '@/lib/distribution'

const props = defineProps<{ open: boolean; name: string; groupId: string; placement: Placement }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'created', outcome: AdmissionResponse): void }>()

const { createDistributedBucket, retryDistributedAdmission, sessionEpoch } = useAruna()
const outcome = ref<AdmissionResponse | null>(null)
const busy = ref(false)
const failure = ref<string | null>(null)

// One request per opening. The answer counts only for the session that asked.
async function run(work: () => Promise<AdmissionResponse>) {
  const epoch = sessionEpoch.value
  busy.value = true
  failure.value = null
  try {
    const answer = await work()
    if (epoch !== sessionEpoch.value) return
    outcome.value = answer
  } catch (cause) {
    if (epoch === sessionEpoch.value) failure.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    outcome.value = null
    void run(() => createDistributedBucket(props.groupId, createRequest(props.name, props.placement)))
  },
  { immediate: true },
)

function retry() {
  const current = outcome.value
  if (current) void run(() => retryDistributedAdmission(props.groupId, current.set_id))
}

function done() {
  if (outcome.value) emit('created', outcome.value)
  emit('update:open', false)
}

// A bucket that was not created can be closed at once; a created one is closed with Done.
function update(open: boolean) {
  if (busy.value) return
  if (open || !outcome.value) emit('update:open', open)
  else done()
}
</script>

<template>
  <Dialog :open="open" @update:open="update">
    <DialogContent class="max-w-3xl">
      <CreateResults v-if="outcome" :name="name" :outcome="outcome" :busy="busy" :failure="failure" @retry="retry" @done="done" />
      <template v-else>
        <DialogHeader><DialogTitle>Creating {{ name }}</DialogTitle></DialogHeader>
        <Notice v-if="failure" tone="error" title="The bucket was not created">{{ failure }}</Notice>
        <Spinner v-else-if="busy" show-label label="Creating the bucket on the nodes…" />
      </template>
    </DialogContent>
  </Dialog>
</template>
