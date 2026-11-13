<script setup lang="ts">
// Link an S3 bucket or local folder of a storage to an Aruna bucket, then run its first sync.
// A link works only on a node that holds both the Aruna bucket and this storage, so each
// node is checked for both and the link goes to the chosen node.
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Server } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import StorageBackendDialog from '@/components/groups/StorageBackendDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useImportRoots } from '@/composables/useImportRoots'
import { useRealmNodes, type RealmNodeDisplay } from '@/composables/useRealmNodes'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { ApiError, createBackendImport, runBackendImport, type BackendImport, type GroupBackendResponse } from '@/lib/api'
import { NAMING_OPTIONS, namingPattern, type NamingChoice } from '@/lib/bucketNaming'
import { folderPath } from '@/lib/linkedFolders'
import { folderProblem, sameStore } from '@/lib/storage'
import { arunaConflict, bucketProblem, linkConflict, splitsBuckets } from '@/lib/storageRules'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  groupId: string
  backend: GroupBackendResponse | null
  /** All storages of the group, to pick where a read-only folder writes. */
  backends: GroupBackendResponse[]
  links: BackendImport[]
  /** The S3 bucket template of this storage on the connected node, for a copy of it on another node. */
  rule?: string | null
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'saved', runError?: string): void }>()

const { apiBaseUrl, authToken, sessionEpoch, nodeClientReady, listGroupBackends, getBucketRouting } = useAruna()
const realmNodes = useRealmNodes()
const { writesDisabled } = useConnectivity()
const uid = useId()

const NAMES = NAMING_OPTIONS.filter((option) => option.value === 'plain' || option.value === 'suffix')

const s3Bucket = ref('')
const folder = ref('')
const arunaBucket = ref('')
const naming = ref<NamingChoice>('plain')
const writer = ref('')
const saving = ref(false)
const submitError = ref<string | null>(null)

const folderMode = computed(() => props.backend?.kind === 'fs')
const { roots, state: rootsState, error: rootsError, load: reloadRoots } = useImportRoots(
  computed(() => props.groupId),
  computed(() => props.open && folderMode.value),
)
const rootInfo = computed(() => roots.value.find((root) => root.name === props.backend?.public_config.root))
// A read-only folder cannot take new uploads, so another storage must.
const needsWriter = computed(() => folderMode.value && rootsState.value === 'ready' && rootInfo.value?.writable !== true)
const writable = (other: GroupBackendResponse) =>
  other.kind !== 'fs' || roots.value.some((root) => root.name === other.public_config.root && root.writable)
const writers = computed(() =>
  props.backends
    .filter((other) => other.backend_id !== props.backend?.backend_id && !other.disabled && writable(other))
    .map((other) => ({ value: other.backend_id, label: other.name })),
)
const rootProblem = computed(() => {
  if (!folderMode.value || rootsState.value !== 'ready') return null
  return rootInfo.value ? null : 'The node operator no longer approves this folder.'
})

const splits = computed(() => Boolean(props.backend && splitsBuckets(props.backend)))
const storagePath = computed(() => (splits.value ? `${s3Bucket.value.trim()}/${folderPath(folder.value)}` : folderPath(folder.value)))
const bucket = computed(() => arunaBucket.value.trim() || (splits.value ? s3Bucket.value.trim() : ''))
const ready = computed(
  () =>
    Boolean(bucket.value && (!splits.value || s3Bucket.value.trim())) &&
    (!folderMode.value || (rootsState.value === 'ready' && !rootProblem.value)) &&
    (!needsWriter.value || writers.value.some((option) => option.value === writer.value)),
)

// The reachable realm nodes, the connected node first; a folder belongs to the connected node.
const rank = (node: RealmNodeDisplay) => (node.kind === 'management' ? 2 : node.isLocal ? 0 : 1)
const hosts = computed(() =>
  folderMode.value ? [] : realmNodes.nodes.value.filter((node) => node.kind !== 'user' && node.reachable).sort((a, b) => rank(a) - rank(b)),
)
// Per node: this storage there (null: none), whether it holds the bucket; a missing entry is being read.
const stores = ref(new Map<string, GroupBackendResponse | null | 'failed'>())
const holding = ref(new Map<string, boolean | 'failed'>())
const nodeId = ref('')
const addNode = ref<string | null>(null)
const addOpen = ref(false)
const addError = ref<string | null>(null)

type HostRow = { node: RealmNodeDisplay; store: GroupBackendResponse | null; checking: boolean; usable: boolean; canAdd: boolean; line: string }
function hostRow(node: RealmNodeDisplay): HostRow {
  const store = stores.value.get(node.nodeId)
  const holds = bucket.value ? holding.value.get(node.nodeId) : true
  const name = props.backend?.name ?? 'this'
  const known = store !== undefined && store !== 'failed' && holds !== undefined && holds !== 'failed'
  if (!known) {
    const failed = store === 'failed' || holds === 'failed'
    return { node, store: null, checking: !failed, usable: false, canAdd: false, line: failed ? 'Could not check this node' : 'Checking…' }
  }
  const missing = [
    ...(holds ? [] : [`Does not hold ${bucket.value}`]),
    ...(store ? [] : [holds ? `No ${name} storage on this node` : `no ${name} storage`]),
  ]
  const held = bucket.value ? `Holds ${bucket.value} and ${name} storage` : `${name} storage on this node`
  return { node, store, checking: false, usable: Boolean(store && holds), canAdd: Boolean(!store && holds && bucket.value), line: missing.join(', ') || held }
}
const hostRows = computed(() => hosts.value.map(hostRow))
const chosen = computed(() => hostRows.value.find((row) => row.node.nodeId === nodeId.value && row.usable) ?? null)
const nodeReady = computed(() => !hosts.value.length || Boolean(chosen.value))

let storesRun = 0
function loadStores(only?: string) {
  const run = only ? storesRun : ++storesRun
  const backend = props.backend
  if (!backend) return
  if (!only) stores.value = new Map()
  for (const node of hosts.value) {
    if (only && node.nodeId !== only) continue
    void listGroupBackends(props.groupId, node.nodeId).then(
      (list) => list.backends.find((entry) => !entry.disabled && sameStore(entry, backend)) ?? null,
      () => 'failed' as const,
    ).then((store) => {
      if (run === storesRun) stores.value = new Map(stores.value).set(node.nodeId, store)
    })
  }
}

// Whether each node holds the bucket, read once typing pauses; a 404 means it does not, and a
// 403 means the bucket there belongs to another group.
let holdRun = 0
let holdTimer: ReturnType<typeof setTimeout> | undefined
function checkHolding() {
  const run = ++holdRun
  clearTimeout(holdTimer)
  holding.value = new Map()
  const name = bucket.value
  if (!name || !hosts.value.length) return
  holdTimer = setTimeout(() => {
    for (const node of hosts.value) {
      void getBucketRouting(name, node.nodeId).then(
        () => true,
        (err) => (err instanceof ApiError && (err.status === 404 || err.status === 403) ? false : ('failed' as const)),
      ).then((holds) => {
        if (run === holdRun) holding.value = new Map(holding.value).set(node.nodeId, holds)
      })
    }
  }, 300)
}
onBeforeUnmount(() => clearTimeout(holdTimer))

// Once every node answered for the bucket, the node picked by hand stays while it still works;
// otherwise the node that can take the link is chosen, of several the connected node first.
const manual = ref('')
watch(hostRows, (rows) => {
  if (rows.some((row) => row.checking)) return
  const usable = rows.filter((row) => row.usable)
  const kept = usable.find((row) => row.node.nodeId === manual.value)
  nodeId.value = (kept ?? usable.find((row) => row.node.isLocal) ?? usable[0])?.node.nodeId ?? ''
})
watch(bucket, () => {
  if (props.open) checkHolding()
})
watch(hosts, () => {
  if (!props.open) return
  loadStores()
  checkHolding()
})

function addStorage(id: string) {
  addNode.value = id
  addError.value = null
  addOpen.value = true
}
function storageAdded(_saved?: GroupBackendResponse, ruleError?: string) {
  addError.value = ruleError ?? null
  if (addNode.value) {
    stores.value = new Map([...stores.value].filter(([id]) => id !== addNode.value))
    loadStores(addNode.value)
  }
}

// The connected node's links say what overlaps there; another node checks its own.
const localLinks = computed(() => !hosts.value.length || chosen.value?.node.isLocal !== false)
const problem = computed(() => {
  if (!props.backend || !ready.value) return null
  return (
    (folderMode.value ? folderProblem(storagePath.value) : null) ??
    bucketProblem(bucket.value) ??
    (localLinks.value ? arunaConflict(props.links, bucket.value, '') : null) ??
    (localLinks.value ? linkConflict(props.backend, props.links, storagePath.value, null, true) : null)
  )
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    s3Bucket.value = ''
    folder.value = ''
    arunaBucket.value = ''
    writer.value = ''
    naming.value = 'plain'
    submitError.value = null
    nodeId.value = ''
    addError.value = null
    manual.value = ''
    loadStores()
    checkHolding()
  },
)

watch(sessionEpoch, () => {
  if (props.open) emit('update:open', false)
})

async function submit() {
  const backend = props.backend
  if (!backend || !ready.value || !nodeReady.value || problem.value || saving.value || writesDisabled.value) return
  saving.value = true
  submitError.value = null
  const target = chosen.value
  const epoch = sessionEpoch.value
  try {
    const client = target ? await nodeClientReady(target.node.nodeId) : { baseUrl: apiBaseUrl.value, token: authToken.value }
    const created = await createBackendImport(
      props.groupId,
      {
        backend_id: target?.store?.backend_id ?? backend.backend_id,
        backend_prefix: storagePath.value,
        bucket: bucket.value,
        key_prefix: '',
        ...(needsWriter.value ? { write_backend_id: writer.value } : {}),
        write_pattern: namingPattern(naming.value, ''),
      },
      client,
    )
    let runError: string | undefined
    try {
      await runBackendImport(props.groupId, created.import_id, client)
    } catch (err) {
      // A run the node already started is what was asked for.
      if (!(err instanceof ApiError && err.status === 409)) runError = `Linked, but the first sync did not start: ${errorMessage(err)}`
    }
    if (epoch !== sessionEpoch.value) return
    emit('saved', runError)
    emit('update:open', false)
  } catch (err) {
    if (epoch === sessionEpoch.value) submitError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ folderMode ? 'Link a folder' : 'Link an S3 bucket' }}</DialogTitle>
        <DialogDescription>
          Files already in it show up in Aruna. Nothing is copied.
          <StorageFeatureLink question="elsewhere" class="ml-1" />
        </DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-if="splits">
            <label :for="`${uid}-s3`" class="text-xs font-medium">S3 bucket</label>
            <Input :id="`${uid}-s3`" v-model="s3Bucket" class="mt-1 font-mono" placeholder="lab-raw" />
          </div>
          <div>
            <label :for="`${uid}-folder`" class="text-xs font-medium">Folder <span class="text-muted-foreground">(optional)</span></label>
            <Input :id="`${uid}-folder`" v-model="folder" class="mt-1 font-mono" :placeholder="splits ? 'whole bucket' : 'whole storage'" />
          </div>
          <div>
            <label :for="`${uid}-aruna`" class="text-xs font-medium">Aruna bucket</label>
            <Input
              :id="`${uid}-aruna`"
              v-model="arunaBucket"
              class="mt-1 font-mono"
              :placeholder="splits ? 'same as S3 bucket' : 'sequencing'"
            />
          </div>
          <div>
            <label class="text-xs font-medium">New uploads are named</label>
            <Select v-model="naming" :options="NAMES" aria-label="New uploads are named" class="mt-1" />
          </div>
        </div>
        <p v-if="rootsState === 'loading'" class="text-xs text-muted-foreground">Loading approved folders…</p>
        <Notice v-else-if="rootsState === 'failed'" tone="error">
          {{ rootsError }}
          <button type="button" class="ml-1 underline" @click="reloadRoots">Try again</button>
        </Notice>
        <p v-if="rootProblem" class="text-xs text-destructive">{{ rootProblem }}</p>
        <div v-if="needsWriter && rootInfo">
          <label class="text-xs font-medium">Write new uploads to</label>
          <Select v-model="writer" :options="writers" placeholder="Pick a storage" aria-label="Write new uploads to" class="mt-1" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            This folder is read-only, so Aruna cannot write new files into it.
            {{ writers.length ? 'Pick another storage that takes them.' : 'Add another storage that takes them first.' }}
          </p>
        </div>
        <fieldset v-if="hosts.length">
          <legend class="text-xs font-medium">Node</legend>
          <div class="mt-1 grid gap-1.5">
            <label
              v-for="row in hostRows"
              :key="row.node.nodeId"
              class="flex min-h-10 items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
              :class="!row.usable ? 'cursor-not-allowed border-input' : nodeId === row.node.nodeId ? 'cursor-pointer border-primary' : 'cursor-pointer border-input hover:bg-muted/50'"
            >
              <input
                type="radio"
                name="link-node"
                class="accent-primary"
                :checked="nodeId === row.node.nodeId"
                :disabled="!row.usable"
                @change="manual = nodeId = row.node.nodeId"
              />
              <Server class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block font-medium" :class="row.usable ? 'text-foreground' : 'text-muted-foreground'">{{ realmNodes.displayName(row.node.nodeId) }}</span>
                <span class="block text-xs text-muted-foreground">{{ row.line }}</span>
              </span>
              <Button v-if="row.canAdd" type="button" variant="outline" size="sm" :disabled="writesDisabled" @click="addStorage(row.node.nodeId)">
                + Add storage
              </Button>
            </label>
          </div>
        </fieldset>
        <Notice v-if="addError" tone="error">{{ addError }}</Notice>
        <p v-if="problem" class="text-xs text-destructive">{{ problem }}</p>
        <p v-else-if="ready" class="text-xs text-muted-foreground">
          After linking: <span class="font-mono text-foreground">{{ storagePath || '/' }}</span> ⇆ Aruna bucket
          <span class="font-mono text-foreground">{{ bucket }}</span>
        </p>
        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline" size="sm">Cancel</Button></DialogClose>
          <Button
            type="submit"
            size="sm"
            :disabled="!ready || !nodeReady || Boolean(problem) || saving || writesDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          >
            {{ saving ? 'Linking…' : 'Link and sync' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  <StorageBackendDialog
    v-model:open="addOpen"
    :group-id="groupId"
    :node-id="addNode"
    :prefill="backend"
    :rule="rule"
    @saved="storageAdded"
  />
</template>
