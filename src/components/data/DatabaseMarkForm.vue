<script setup lang="ts">
// Marks a bucket as a database. A dataset describes it: an existing one, or one made here. The form
// adds the bucket root as a part of the dataset, which the mark needs; the owning group agrees next.
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabaseRequests } from '@/composables/useDatabaseRequests'
import { useDatabases } from '@/composables/useDatabases'
import { useDatasetLinks } from '@/composables/useDatasetLinks'
import { usePathPrefixes } from '@/composables/usePathPrefixes'
import { joinPath } from '@/composables/useSessionFiles'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, apiErrorMessage, type MarkDatabaseResponse } from '@/lib/api'
import { databaseCrate, requestOf, targetOf, withBucketPart, type DatasetFields } from '@/lib/databases'
import { partId } from '@/lib/linkedPart'
import { slugify } from '@/lib/profiles/emit'

const props = defineProps<{
  bucket: string
  /** The node of a bucket on another node; null for this node. */
  nodeId: string | null
  /** The set of a bucket stored on more nodes, or null for an ordinary bucket. */
  setId: string | null
  /** The group that owns the bucket; a new dataset is made in it. */
  groupId?: string | null
  groupName?: string | null
}>()
const emit = defineEmits<{ (e: 'done'): void }>()

const { createMetadata, fetchRevisedCrate, listGroupMetadata, markDatabase, nodeInfo, replaceMetadataRoCrate, sessionEpoch, toMetadataDoc } = useAruna()
const { localNodeId } = useRealmNodes()
const databases = useDatabases()
const requests = useDatabaseRequests()
const prefixes = usePathPrefixes(computed(() => props.groupId ?? undefined))

const MODES = [
  { value: 'existing', label: 'Use a dataset' },
  { value: 'new', label: 'Create a dataset' },
]
const mode = ref('existing')
const dataset = ref('')
const fields = reactive<DatasetFields>({ name: props.bucket, description: '', version: '', license: '', page: '' })
const failure = ref<string | null>(null)
const busy = ref(false)
const outcome = ref<{ status: MarkDatabaseResponse['status']; datasetId: string } | null>(null)
let runs = 0

// Datasets that already link the bucket first, then the datasets of the owning group.
const links = useDatasetLinks(computed(() => ({ bucket: props.bucket, key: '', folder: true, node: props.nodeId })))
const groupDatasets = ref<{ value: string; label: string }[]>([])
watch(
  () => [props.groupId, sessionEpoch.value],
  async () => {
    const groupId = props.groupId
    groupDatasets.value = []
    if (!groupId) return
    const page = await listGroupMetadata(groupId, { limit: 100, summary: true }).catch(() => null)
    if (!page || groupId !== props.groupId) return
    groupDatasets.value = page.documents
      .filter((item) => !item.document_path.startsWith('profiles/'))
      .map((item) => ({ value: item.document_id, label: toMetadataDoc(item).title || item.document_path }))
  },
  { immediate: true },
)
const options = computed(() => {
  const linked = links.documents.value.map((document) => ({
    value: document.document_id,
    label: `${document.title || document.document_path} (links this bucket)`,
  }))
  const known = new Set(linked.map((option) => option.value))
  return [...linked, ...groupDatasets.value.filter((option) => !known.has(option.value))]
})

const target = computed(() => {
  const node = props.nodeId ?? localNodeId.value
  return node ? targetOf(props.bucket, node, props.setId) : null
})
// The id the dataset uses for the bucket root: the set's global id, or the bucket's ARN.
const part = computed(() => {
  const realmId = nodeInfo.value?.node.realm_id
  const nodeId = props.nodeId ?? localNodeId.value
  return realmId && nodeId ? partId({ realmId, nodeId, bucket: props.bucket, prefix: '', setId: props.setId }) : null
})
// A mark that already waits for the owning group is not asked for twice.
const pending = computed(() => Boolean(target.value && requestOf(requests.requests.value, target.value)))
const ready = computed(() => (mode.value === 'new' ? Boolean(fields.name.trim() && props.groupId) : Boolean(dataset.value)))

watch(
  () => JSON.stringify([props.bucket, props.nodeId, props.setId, sessionEpoch.value]),
  () => {
    runs++
    dataset.value = ''
    outcome.value = null
    failure.value = null
    busy.value = false
  },
)

// A new dataset in the owning group, named after its title.
async function createDataset(where: string): Promise<string> {
  const name = slugify(fields.name) || slugify(props.bucket)
  const created = await createMetadata({
    group_id: props.groupId ?? '',
    path: joinPath(prefixes.preselected.value ?? '', name),
    public: false,
    rocrate: databaseCrate(fields, where, props.bucket),
  })
  return created.document_id
}

// Adds the bucket root to the dataset unless it is a part already; true when the dataset changed.
async function linkDataset(id: string, where: string): Promise<boolean> {
  const revised = await fetchRevisedCrate(id)
  const next = withBucketPart(revised.rocrate, where, props.bucket)
  if (!next) return false
  const expected = revised.revision ? { expected_revision: revised.revision } : {}
  await replaceMetadataRoCrate(id, { rocrate: next, ...expected, message: `Add the bucket ${props.bucket} as a part` })
  return true
}

// A dataset written a moment ago may not be indexed yet, and the node refuses the mark with 400
// until it is. A refused mark changed nothing, so asking again is safe.
const RETRY_MS = [1000, 2000, 4000, 8000]
async function markWhenIndexed(datasetId: string, wrote: boolean, current: () => boolean): Promise<MarkDatabaseResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await markDatabase({ dataset_id: datasetId, target: target.value! })
    } catch (cause) {
      const unindexed = wrote && cause instanceof ApiError && cause.status === 400
      if (!unindexed || attempt >= RETRY_MS.length || !current()) throw cause
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS[attempt]))
    }
  }
}

async function mark() {
  const where = part.value
  if (!where || !target.value || !ready.value || pending.value || busy.value) return
  const run = ++runs
  const epoch = sessionEpoch.value
  const current = () => run === runs && epoch === sessionEpoch.value
  busy.value = true
  failure.value = null
  try {
    const creating = mode.value === 'new'
    const datasetId = creating ? await createDataset(where) : dataset.value
    const wrote = creating || (await linkDataset(datasetId, where))
    if (!current()) return
    const answer = await markWhenIndexed(datasetId, wrote, current)
    if (!current()) return
    outcome.value = { status: answer.status, datasetId }
    await Promise.all([databases.reload(), requests.reload()])
    if (current()) emit('done')
  } catch (cause) {
    if (current()) failure.value = apiErrorMessage(cause)
  } finally {
    if (current()) busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-muted-foreground">
      A database entry lists this bucket under Databases, described by a dataset: its name, description, version,
      license and source. The entry grants no access: the bucket still decides who may read the files.
    </p>
    <template v-if="outcome">
      <Notice v-if="outcome.status === 'published'" tone="success" title="Published">This bucket is listed as a database.</Notice>
      <Notice v-else tone="warning" :title="`Waiting for the group admins${groupName ? ` of ${groupName}` : ''}`">
        Pending consent: the mark takes effect when they agree.
      </Notice>
      <RouterLink :to="{ name: 'dataset', params: { id: outcome.datasetId } }" class="text-xs text-primary hover:underline">Open the dataset</RouterLink>
    </template>
    <template v-else>
      <OptionToggle v-model="mode" :options="MODES" aria-label="Which dataset describes the database" />
      <template v-if="mode === 'existing'">
        <Spinner v-if="links.state.value === 'loading' && !options.length" label="Looking for datasets" />
        <p v-else-if="!options.length" class="text-xs text-muted-foreground">No dataset found. Create one here instead.</p>
        <Select v-else v-model="dataset" :options="options" placeholder="Dataset that describes it" aria-label="Dataset" />
        <p class="text-xs text-muted-foreground">The bucket is added to the dataset as a part if it is not one yet.</p>
        <Button v-if="links.more.value" variant="ghost" size="sm" :disabled="links.loadingMore.value" @click="links.loadMore()">More datasets</Button>
        <p v-if="links.state.value === 'failed'" class="text-xs text-muted-foreground">Datasets that link this bucket could not be read: {{ links.error.value }}</p>
      </template>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <Input v-model="fields.name" placeholder="Name" aria-label="Name" class="sm:col-span-2" />
        <Textarea v-model="fields.description" placeholder="Description" aria-label="Description" class="sm:col-span-2" />
        <Input v-model="fields.version" placeholder="Version, for example 2026-10" aria-label="Version" />
        <Input v-model="fields.license" placeholder="License URL or name" aria-label="License" />
        <Input v-model="fields.page" placeholder="Landing page or DOI" aria-label="Landing page or DOI" class="sm:col-span-2" />
        <p v-if="!groupId" class="text-xs text-muted-foreground sm:col-span-2">The group of this bucket is not known, so no dataset can be made here.</p>
        <p v-else class="text-xs text-muted-foreground sm:col-span-2">
          The dataset is made in {{ groupName ?? 'the group of this bucket' }} and visible to its members. Edit it later like any dataset.
        </p>
      </div>
      <Button size="sm" :disabled="!ready || busy || pending || !part" @click="mark">
        {{ busy ? 'Marking…' : 'Mark as database' }}
      </Button>
      <Notice v-if="pending" tone="warning" :title="`Waiting for the group admins${groupName ? ` of ${groupName}` : ''}`">
        Pending consent: the mark takes effect when they agree.
      </Notice>
    </template>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
  </div>
</template>
