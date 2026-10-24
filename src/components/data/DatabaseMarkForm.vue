<script setup lang="ts">
// Marks a bucket as a database. The dataset must already list the bucket as a part, which is the
// dataset owner's agreement. The group that owns the bucket agrees next, unless the user is its admin.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabaseRequests } from '@/composables/useDatabaseRequests'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { apiErrorMessage, type DataLinkDocument } from '@/lib/api'
import { targetOf } from '@/lib/databases'

const props = defineProps<{
  bucket: string
  /** The node of a bucket on another node; null for this node. */
  nodeId: string | null
  /** The set of a bucket stored on more nodes, or null for an ordinary bucket. */
  setId: string | null
  groupName?: string | null
}>()
const emit = defineEmits<{ (e: 'done'): void }>()

const { getBucketLinks, markDatabase } = useAruna()
const { localNodeId } = useRealmNodes()
const databases = useDatabases()
const requests = useDatabaseRequests()

const candidates = ref<DataLinkDocument[] | null>(null)
const failure = ref<string | null>(null)
const dataset = ref('')
const busy = ref(false)
const waiting = ref(false)
let runs = 0

// The datasets whose linked part is exactly this bucket's root.
watch(
  () => [props.bucket, props.nodeId],
  async () => {
    const run = ++runs
    candidates.value = null
    dataset.value = ''
    if (props.nodeId) return
    try {
      const page = await getBucketLinks(props.bucket, { prefix: '', parts_only: true, limit: 100 })
      if (run === runs) candidates.value = page.documents
    } catch (cause) {
      if (run === runs) failure.value = apiErrorMessage(cause)
    }
  },
  { immediate: true },
)

const options = computed(() =>
  (candidates.value ?? []).map((document) => ({ value: document.document_id, label: document.title || document.document_path })),
)

async function mark() {
  const node = props.nodeId ?? localNodeId.value
  if (!dataset.value || !node) return
  busy.value = true
  failure.value = null
  try {
    const answer = await markDatabase({ dataset_id: dataset.value, target: targetOf(props.bucket, node, props.setId) })
    waiting.value = answer.status === 'pending_consent'
    await Promise.all([databases.reload(), requests.reload()])
    if (!waiting.value) emit('done')
  } catch (cause) {
    failure.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <Notice v-if="nodeId" tone="info">This bucket is on another node. Mark it from the portal of that node.</Notice>
    <Spinner v-else-if="candidates === null && !failure" label="Looking for datasets" />
    <template v-else-if="candidates !== null">
      <p v-if="!candidates.length" class="text-xs text-muted-foreground">
        No dataset lists this bucket as a part yet. Add the bucket to a dataset first, then come back.
        <RouterLink :to="{ name: 'dataset-new' }" class="text-primary hover:underline">New dataset</RouterLink>
      </p>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <Select v-model="dataset" :options="options" placeholder="Dataset that describes it" aria-label="Dataset" />
        <div class="flex gap-2 sm:col-span-2">
          <Button size="sm" :disabled="!dataset || busy" @click="mark">
            Mark as database
          </Button>
        </div>
      </div>
    </template>
    <Notice v-if="waiting" tone="warning" :title="`Waiting for the group admins${groupName ? ` of ${groupName}` : ''}`">
      The mark takes effect when they agree.
    </Notice>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
  </div>
</template>
