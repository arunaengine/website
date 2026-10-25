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
import { useDatasetLinks } from '@/composables/useDatasetLinks'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { apiErrorMessage } from '@/lib/api'
import { requestOf, targetOf } from '@/lib/databases'
import { partId } from '@/lib/linkedPart'

const props = defineProps<{
  bucket: string
  /** The node of a bucket on another node; null for this node. */
  nodeId: string | null
  /** The set of a bucket stored on more nodes, or null for an ordinary bucket. */
  setId: string | null
  groupName?: string | null
}>()
const emit = defineEmits<{ (e: 'done'): void }>()

const { markDatabase, nodeInfo, sessionEpoch } = useAruna()
const { localNodeId } = useRealmNodes()
const databases = useDatabases()
const requests = useDatabaseRequests()

const failure = ref<string | null>(null)
const dataset = ref('')
const busy = ref(false)
const waiting = ref(false)
let runs = 0

// The datasets whose linked part is exactly this bucket's root, paged and with their coverage.
const links = useDatasetLinks(computed(() => ({ bucket: props.bucket, key: '', folder: true, remote: Boolean(props.nodeId) })))
const options = computed(() =>
  links.documents.value.map((document) => ({ value: document.document_id, label: document.title || document.document_path })),
)
// "No dataset lists it" needs the whole answer; a hidden or missing dataset may still list it.
const noneAtAll = computed(() => links.complete.value && !links.hidden.value && !links.more.value)

const target = computed(() => {
  const node = props.nodeId ?? localNodeId.value
  return node ? targetOf(props.bucket, node, props.setId) : null
})
const key = computed(() => JSON.stringify([props.bucket, props.nodeId, props.setId]))
// A mark that already waits for the owning group is not asked for twice.
const pending = computed(() => waiting.value || Boolean(target.value && requestOf(requests.requests.value, target.value)))
watch(key, () => {
  runs++
  dataset.value = ''
  waiting.value = false
  failure.value = null
  busy.value = false
})
watch(() => sessionEpoch.value, () => {
  runs++
  waiting.value = false
  busy.value = false
})

// A new dataset starts with the bucket root as its linked part, which the mark needs.
const newDataset = computed(() => {
  const realmId = nodeInfo.value?.node.realm_id
  const node = props.nodeId ?? localNodeId.value
  if (!realmId || !node) return { name: 'dataset-new' }
  const part = partId({ realmId, nodeId: node, bucket: props.bucket, prefix: '', setId: props.setId })
  return { name: 'dataset-new', query: { part, partName: props.bucket } }
})

async function mark() {
  if (!dataset.value || !target.value || pending.value || busy.value) return
  const run = ++runs
  const epoch = sessionEpoch.value
  const current = () => run === runs && epoch === sessionEpoch.value
  busy.value = true
  failure.value = null
  try {
    const answer = await markDatabase({ dataset_id: dataset.value, target: target.value })
    if (!current()) return
    waiting.value = answer.status === 'pending_consent'
    await Promise.all([databases.reload(), requests.reload()])
    if (current() && !waiting.value) emit('done')
  } catch (cause) {
    if (current()) failure.value = apiErrorMessage(cause)
  } finally {
    if (current()) busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <Notice v-if="nodeId" tone="info">This bucket is on another node. Mark it from the portal of that node.</Notice>
    <Spinner v-else-if="links.state.value === 'loading'" label="Looking for datasets" />
    <Notice v-else-if="links.state.value === 'failed'" tone="error">The datasets could not be read: {{ links.error.value }}</Notice>
    <p v-else-if="links.state.value === 'missing'" class="text-xs text-muted-foreground">This node cannot list the datasets that link a bucket.</p>
    <template v-else>
      <p v-if="!options.length" class="text-xs text-muted-foreground">
        {{ noneAtAll ? 'No dataset lists this bucket as a part yet.' : 'No dataset you can read lists this bucket as a part.' }}
        Add the bucket to a dataset first, then come back.
        <RouterLink :to="newDataset" class="text-primary hover:underline">New dataset</RouterLink>
      </p>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <Select v-model="dataset" :options="options" placeholder="Dataset that describes it" aria-label="Dataset" />
        <div class="flex gap-2 sm:col-span-2">
          <Button size="sm" :disabled="!dataset || busy || pending" @click="mark">
            Mark as database
          </Button>
        </div>
      </div>
      <Button v-if="links.more.value" variant="ghost" size="sm" :disabled="links.loadingMore.value" @click="links.loadMore()">More datasets</Button>
      <p v-if="!links.complete.value" class="text-xs text-muted-foreground">The list may be incomplete: a node did not answer or is still indexing.</p>
      <p v-if="links.error.value" class="text-xs text-muted-foreground">More datasets could not be read: {{ links.error.value }}</p>
    </template>
    <Notice v-if="pending" tone="warning" :title="`Waiting for the group admins${groupName ? ` of ${groupName}` : ''}`">
      The mark takes effect when they agree.
    </Notice>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
  </div>
</template>
