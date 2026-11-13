<script setup lang="ts">
// New bucket on the web: a name, where the files live and the node. One realm node holds an ordinary
// bucket, made through a session on that node; spread over several nodes, the storage dialog sets
// the copies and each node's answer is shown. A referenced bucket goes on to the import of its source.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import BucketCreateResults from '@/components/data/BucketCreateResults.vue'
import BucketStorageDialog from '@/components/data/BucketStorageDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { s3ErrorMessage, useS3 } from '@/composables/useS3'
import type { AdmissionResponse } from '@/lib/api'
import type { BindSource } from '@/lib/bindSource'
import { BUCKET_NAME_REQUIREMENT, bucketNameProblem } from '@/lib/bucketName'
import { fillTemplate } from '@/lib/bucketNaming'
import { readFreeSpace } from '@/lib/bucketPlace'
import { defaultPlacement, type Placement } from '@/lib/distributedMock'
import { formatBytes } from '@/lib/utils'
import { FolderPlus, Link, Network, Server } from '@lucide/vue'

const props = defineProps<{ open: boolean; groupId: string | null; nodeId: string | null }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** `source`: the address a referenced bucket reads from, for the import that follows. */
  (e: 'created', bucket: BindSource, source?: string): void
}>()

const SPREAD = 'several'
const { apiBaseUrl, sessionEpoch, apiGroups, getGroupRouting, listGroupBackends } = useAruna()
const realmNodes = useRealmNodes()
const s3 = useS3()

const name = ref('')
const choice = ref('')
const error = ref<string | null>(null)
const creating = ref(false)
const placement = ref<Placement>(defaultPlacement())
const storageOpen = ref(false)
const resultsOpen = ref(false)
// Space left per node; a missing entry is still being read.
const free = ref(new Map<string, number | null>())
// The S3 bucket template of the group on each node and the storage it names; null: none there.
// A missing entry is being read or could not be read, so the row says nothing about it.
const rules = ref(new Map<string, { template: string; store: string | null } | null>())
// Set once the node is chosen by hand, so a later answer does not move it.
const picked = ref(false)
// The nodes whose rule is still being read; a failed read counts as read.
const reading = ref(new Set<string>())
// While a node's rule is read, a choice not made by hand may still move.
const settling = computed(() => !picked.value && kind.value === 'stored' && reading.value.size > 0)

// The reachable realm nodes, the open node first and a management node last, as it usually
// holds no data; devices hold no new buckets here.
const rank = (node: { nodeId: string; kind: string }) => (node.kind === 'management' ? 2 : node.nodeId === props.nodeId ? 0 : 1)
const places = computed(() =>
  realmNodes.nodes.value
    .filter((node) => node.kind !== 'user' && node.reachable)
    .sort((a, b) => rank(a) - rank(b)),
)
const trimmed = computed(() => name.value.trim())
const nameProblem = computed(() => (trimmed.value ? bucketNameProblem(trimmed.value) : null))
const spread = computed(() => choice.value === SPREAD)
type Kind = 'stored' | 'referenced'
const KINDS = [
  { value: 'stored', label: 'Stored in the realm', icon: Server, line: '' },
  { value: 'referenced', label: 'Referenced from a source', icon: Link, line: 'Files stay at their source, for example an FTP site. Aruna reads them in place.' },
] as const
const kind = ref<Kind>('stored')
const source = ref('')
const nameHint = computed(() => nameProblem.value ?? (trimmed.value ? `The address will be s3://${trimmed.value}` : BUCKET_NAME_REQUIREMENT))
// The nodes the files are kept on, as the chosen place says; never a number it does not know.
const storedLine = computed(() =>
  spread.value && placement.value.members.length
    ? `Kept on ${placement.value.members.length} nodes, counted against quotas.`
    : spread.value
      ? 'Kept on several nodes, counted against quotas.'
      : choice.value
        ? `Kept on ${realmNodes.displayName(choice.value)}, counted against quotas.`
        : 'Counted against quotas.')
const groupName = computed(() => apiGroups.value.find((group) => group.group_id === props.groupId)?.display_name ?? '{group}')
const ownBucket = (template: string) => fillTemplate(template, trimmed.value || '{bucket}', groupName.value)
// A referenced bucket lives on one node; the spread stays a choice of stored data.
function pickKind(value: Kind) {
  kind.value = value
  if (value === 'referenced' && spread.value) choice.value = places.value[0]?.nodeId ?? ''
}
const canCreate = computed(() =>
  Boolean(trimmed.value && props.groupId && choice.value && (kind.value === 'stored' || source.value.trim())) &&
  !nameProblem.value && !creating.value && !settling.value)

function freeLabel(id: string): string {
  if (!free.value.has(id)) return ''
  const bytes = free.value.get(id)
  return bytes == null ? '' : `${formatBytes(bytes)} free`
}

let freeRun = 0
function loadFree() {
  const run = ++freeRun
  free.value = new Map()
  for (const entry of places.value) {
    void readFreeSpace(entry.isLocal ? apiBaseUrl.value : entry.apiBase).then((bytes) => {
      if (run === freeRun) free.value = new Map(free.value).set(entry.nodeId, bytes)
    })
  }
}

let rulesRun = 0
function loadRules() {
  const run = ++rulesRun
  const groupId = props.groupId
  rules.value = new Map()
  reading.value = new Set(groupId ? places.value.map((entry) => entry.nodeId) : [])
  if (!groupId) return
  for (const entry of places.value) {
    void Promise.all([getGroupRouting(groupId, entry.nodeId), listGroupBackends(groupId, entry.nodeId).catch(() => null)]).then(
      ([routing, list]) => {
        if (run !== rulesRun) return
        const template = routing.bucket_template
        const id = routing.default_target?.backend_id
        const store = list?.backends.find((backend) => backend.backend_id === id)?.name ?? null
        rules.value = new Map(rules.value).set(entry.nodeId, template ? { template, store } : null)
        // The first node, in the order shown, whose storage gives a new bucket its own S3 bucket.
        const ruled = places.value.find((place) => rules.value.get(place.nodeId))
        if (!picked.value && ruled && kind.value === 'stored') choice.value = ruled.nodeId
      },
      () => {},
    ).then(() => {
      if (run === rulesRun) reading.value = new Set([...reading.value].filter((id) => id !== entry.nodeId))
    })
  }
}

// Bumped on every open, close and unmount, so an older create ends unseen.
let generation = 0
onBeforeUnmount(() => generation++)
watch(
  () => props.open,
  (open) => {
    generation++
    if (!open) return
    name.value = ''
    kind.value = 'stored'
    source.value = ''
    error.value = null
    creating.value = false
    placement.value = defaultPlacement()
    choice.value = places.value[0]?.nodeId ?? ''
    picked.value = false
    loadFree()
    loadRules()
  },
  { immediate: true },
)
// The realm's nodes may arrive after the dialog opened.
watch(places, (entries) => {
  if (!props.open) return
  if (!choice.value) choice.value = entries[0]?.nodeId ?? ''
  loadFree()
  loadRules()
})

// Back to one node in the storage dialog: the first node is chosen again.
watch(placement, (value) => {
  if (!value.several && spread.value) choice.value = places.value[0]?.nodeId ?? ''
})

function pick(value: string) {
  picked.value = true
  choice.value = value
  if (value === SPREAD && !placement.value.several) {
    placement.value = { ...defaultPlacement(), several: true }
    storageOpen.value = true
  }
}

async function submit() {
  if (!canCreate.value || !props.groupId) return
  if (spread.value) return void (resultsOpen.value = true)
  const target: BindSource = { bucket: trimmed.value, nodeId: choice.value, groupId: props.groupId }
  creating.value = true
  error.value = null
  const run = generation
  const epoch = sessionEpoch.value
  const current = () => run === generation && epoch === sessionEpoch.value
  try {
    const session = await s3.activateContext(target.nodeId, target.groupId)
    const reference = { nodeId: session.issuerNodeId, groupId: target.groupId, accessKeyId: session.accessKeyId }
    await s3.createBucket(target.bucket, session.issuerNodeId, reference)
    if (!current()) return
    emit('created', target, kind.value === 'referenced' ? source.value.trim() : undefined)
    emit('update:open', false)
  } catch (err) {
    if (current()) error.value = s3ErrorMessage(err, target.bucket)
  } finally {
    if (run === generation) creating.value = false
  }
}

// A spread bucket opens where one of its nodes answered.
function spreadCreated(outcome: AdmissionResponse) {
  const member = outcome.members.find((entry) => realmNodes.isLocalNode(entry.node_id)) ?? outcome.members[0]
  if (member && props.groupId) emit('created', { bucket: trimmed.value, nodeId: member.node_id, groupId: props.groupId })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>New bucket</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <label class="block">
          <span class="text-xs font-medium text-muted-foreground">Name</span>
          <Input
            v-model="name"
            class="mt-1"
            placeholder="my-results"
            aria-label="Bucket name"
            :invalid="nameProblem ? 'error' : undefined"
            @keyup.enter="submit"
          />
          <span class="mt-1 block text-xs" :class="nameProblem ? 'text-destructive' : 'text-muted-foreground'">{{ nameHint }}</span>
        </label>

        <fieldset>
          <legend class="text-xs font-medium text-muted-foreground">Where the files live</legend>
          <div class="mt-1 grid gap-1.5">
            <label
              v-for="option in KINDS"
              :key="option.value"
              class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
              :class="kind === option.value ? 'border-primary' : 'border-input hover:bg-muted/50'"
            >
              <input type="radio" name="bucket-kind" class="accent-primary" :checked="kind === option.value" @change="pickKind(option.value)" />
              <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block font-medium text-foreground">{{ option.label }}</span>
                <span class="block text-xs text-muted-foreground">{{ option.value === 'stored' ? storedLine : option.line }}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <label v-if="kind === 'referenced'" class="block">
          <span class="text-xs font-medium text-muted-foreground">Source address</span>
          <Input v-model="source" class="mt-1" placeholder="https://ftp.ncbi.nlm.nih.gov/genomes/refseq/" aria-label="Source address" />
        </label>

        <fieldset>
          <legend class="text-xs font-medium text-muted-foreground">Node</legend>
          <div class="mt-1 grid gap-1.5">
            <label
              v-for="entry in places"
              :key="entry.nodeId"
              class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
              :class="choice === entry.nodeId ? 'border-primary' : 'border-input hover:bg-muted/50'"
            >
              <input type="radio" name="bucket-node" class="accent-primary" :checked="choice === entry.nodeId" @change="pick(entry.nodeId)" />
              <Server class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block font-medium text-foreground">{{ realmNodes.displayName(entry.nodeId) }}</span>
                <span v-if="rules.has(entry.nodeId)" class="block text-xs text-muted-foreground">
                  <template v-if="rules.get(entry.nodeId)">
                    Own S3 bucket <span class="font-mono text-foreground">{{ ownBucket(rules.get(entry.nodeId)!.template) }}</span>
                    <template v-if="rules.get(entry.nodeId)!.store"> on <span class="whitespace-nowrap">{{ rules.get(entry.nodeId)!.store }}</span></template>
                  </template>
                  <template v-else>Plain Aruna bucket, no storage rule on this node</template>
                </span>
              </span>
              <span v-if="freeLabel(entry.nodeId)" class="shrink-0 text-xs text-muted-foreground">{{ freeLabel(entry.nodeId) }}</span>
            </label>
            <label
              v-if="kind === 'stored'"
              class="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
              :class="spread ? 'border-primary' : 'border-input hover:bg-muted/50'"
            >
              <input type="radio" name="bucket-node" class="accent-primary" :checked="spread" @change="pick(SPREAD)" />
              <Network class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block font-medium text-foreground">Spread over several nodes</span>
                <span class="block text-xs text-muted-foreground">You pick the nodes and copies next.</span>
              </span>
            </label>
          </div>
        </fieldset>
        <Button v-if="spread" variant="outline" @click="storageOpen = true"><Network class="h-4 w-4" /> Change the nodes and copies</Button>
        <p v-if="!places.length" class="text-xs text-muted-foreground">No reachable realm node is known yet.</p>

        <RefusalNote v-if="error" :message="error" />
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canCreate" @click="submit">
          <Spinner v-if="creating" label="Creating the bucket…" />
          <FolderPlus v-else class="h-4 w-4" />
          Create bucket
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <BucketStorageDialog v-model:open="storageOpen" v-model="placement" />
  <BucketCreateResults
    v-if="groupId"
    v-model:open="resultsOpen"
    :name="trimmed"
    :group-id="groupId"
    :placement="placement"
    @created="spreadCreated"
  />
</template>
