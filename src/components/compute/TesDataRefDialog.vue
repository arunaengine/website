<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import Notice from '@/components/ui/Notice.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Switch from '@/components/ui/Switch.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import DatabasesTab from '@/components/data/add/DatabasesTab.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import RemoteObjectPicker, { type RemotePick } from '@/components/compute/RemoteObjectPicker.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { listBuckets } from '@/composables/useBucketCount'
import { useS3, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { useAruna } from '@/composables/useAruna'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { errorMessage } from '@/lib/utils'
import type { BucketSearchHit } from '@/lib/api'
import {
  normalizeContainerDir,
  pickedEntries,
  validContainerDir,
  type TesDataRefEntry,
} from '@/lib/tes'
import { Database, KeyRound, LogIn, Plus, ShieldAlert } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode: 'input'
    /** Default container directory the picks mount under. */
    mountDefault?: string
    /** Where the caller puts the picks itself; hides the mount directory. */
    destination?: string
    /** Shown as a toggle when set: copy the picks instead of linking them. */
    copy?: boolean
  }>(),
  { mountDefault: '/inputs/', destination: undefined, copy: undefined },
)
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:copy', value: boolean): void
  (e: 'add', entry: TesDataRefEntry): void
}>()

const s3 = useS3()
const { currentUser, myGroups, listBucketObjects, nodeInfo, searchBuckets, sessionEpoch } = useAruna()
const { isLocalNode } = useRealmNodes()
const credentialDialogOpen = ref(false)

// Inputs come from a bucket of this group on this node, a database, or any other bucket the user
// may read, also of other groups and nodes. Those are listed by their own node and pinned.
type Source = 'buckets' | 'databases' | 'other'
const SOURCES = [
  { value: 'buckets', label: 'My buckets' },
  { value: 'databases', label: 'Databases' },
  { value: 'other', label: 'Other buckets' },
]
const source = ref<Source>('buckets')
const database = ref<{ bucket: string; nodeId: string } | null>(null)

function chooseDatabase(bucket: string, nodeId: string) {
  pendingSelection.value = null
  database.value = { bucket, nodeId }
}

const chooseBucket = (hit: BucketSearchHit) => chooseDatabase(hit.bucket, hit.node_id)

// The own groups' buckets that no copy on this node serves; this node's are browsed above them.
const remoteOwn = ref<BucketSearchHit[] | null>(null)
let remoteRun = 0
async function loadRemoteOwn() {
  const run = ++remoteRun
  const epoch = sessionEpoch.value
  const current = () => run === remoteRun && epoch === sessionEpoch.value
  remoteOwn.value = null
  const groups = new Set(myGroups.value.map((group) => group.id))
  const listing = await listBuckets(searchBuckets, undefined, current).catch(() => null)
  if (!current()) return
  const hits = (listing?.hits ?? []).filter((hit) => groups.has(hit.group_id))
  const local = new Set(hits.filter((hit) => isLocalNode(hit.node_id)).map((hit) => hit.bucket))
  const seen = new Set<string>()
  remoteOwn.value = hits.filter((hit) => !local.has(hit.bucket) && !seen.has(hit.bucket) && Boolean(seen.add(hit.bucket)))
}
watch(sessionEpoch, () => {
  remoteRun++
  remoteOwn.value = null
  if (props.open && currentUser.value) void loadRemoteOwn()
})
const groupName = (id: string) => myGroups.value.find((group) => group.id === id)?.name ?? id

function showSource(next: Source) {
  source.value = next
  database.value = null
  pendingSelection.value = null
}

const folderBusy = ref(false)
const folderError = ref<string | null>(null)

// "Mount under": the container directory every pick is staged below. Folders
// keep their name as a subdirectory of it.
const mountDir = ref(props.mountDefault)
const mountDirValid = computed(() => Boolean(props.destination) || validContainerDir(mountDir.value))
const mountDirNormalized = computed(() => props.destination ?? normalizeContainerDir(mountDir.value))

type Selection = { bucket: string; objects: ObjectEntry[]; folders: FolderEntry[] }
const pendingSelection = ref<Selection | null>(null)

// Directly selected objects that also sit under a selected folder ride along
// with the folder entry instead of doubling up.
function coveredByFolder(key: string, folders: FolderEntry[]): boolean {
  return folders.some((folder) => key.startsWith(folder.prefix))
}

const PREVIEW_LIMIT = 6
// Live preview of the container paths the current selection resolves to.
const previewPaths = computed<string[]>(() => {
  const selection = pendingSelection.value
  if (!selection || !mountDirValid.value) return []
  const mount = mountDirNormalized.value
  const lines: string[] = []
  for (const folder of selection.folders) lines.push(`${mount}${folder.name}/ (all files below)`)
  for (const object of selection.objects) {
    if (!coveredByFolder(object.key, selection.folders)) lines.push(`${mount}${object.name}`)
  }
  return lines
})

async function addSelection(selection: Selection) {
  if (!selection.bucket || folderBusy.value) return
  if (!mountDirValid.value) {
    folderError.value = 'Enter a valid absolute mount directory first, for example /work/in/.'
    return
  }
  folderBusy.value = true
  folderError.value = null
  try {
    const mount = mountDirNormalized.value
    const entries: TesDataRefEntry[] = []
    for (const object of selection.objects) {
      if (coveredByFolder(object.key, selection.folders)) continue
      entries.push({
        kind: 'file',
        url: `s3://${selection.bucket}/${object.key}`,
        path: `${mount}${object.name}`,
        name: object.name,
      })
    }
    // A folder is one DIRECTORY input; the node pins every file below it when it accepts the run.
    for (const folder of selection.folders) {
      entries.push({ kind: 'folder', bucket: selection.bucket, prefix: folder.prefix, name: folder.name, basePath: `${mount}${folder.name}/`, files: [], directory: true })
    }
    if (!entries.length) {
      folderError.value = 'The selection contains no files.'
      return
    }
    for (const entry of entries) emit('add', entry)
    emit('update:open', false)
  } catch (err) {
    folderError.value = errorMessage(err)
  } finally {
    folderBusy.value = false
  }
}

// Every file below a folder of another node, with its version, read page by page.
async function folderFiles(bucket: string, nodeId: string, prefix: string) {
  const files: { key: string; versionId: string }[] = []
  let cursor: string | undefined
  do {
    const page = await listBucketObjects(bucket, { prefix, cursor, limit: 1000 }, nodeId)
    files.push(...page.objects.map((item) => ({ key: item.key, versionId: item.version_id })))
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return files
}

async function addRemote(pick: RemotePick) {
  const place = database.value
  const realmId = nodeInfo.value?.node.realm_id
  if (!place || !realmId || folderBusy.value) return
  if (!mountDirValid.value) {
    folderError.value = 'Enter a valid absolute mount directory first, for example /work/in/.'
    return
  }
  folderBusy.value = true
  folderError.value = null
  try {
    const local = isLocalNode(place.nodeId)
    const folders = local
      ? pick.folders
      : await Promise.all(pick.folders.map(async (folder) => ({ ...folder, files: await folderFiles(place.bucket, place.nodeId, folder.prefix) })))
    const entries = pickedEntries({ realmId, nodeId: place.nodeId, bucket: place.bucket, local }, pick.files, folders, mountDirNormalized.value)
    if (!entries.length) {
      folderError.value = 'The selection contains no files.'
      return
    }
    for (const entry of entries) emit('add', entry)
    emit('update:open', false)
  } catch (err) {
    folderError.value = errorMessage(err)
  } finally {
    folderBusy.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    folderBusy.value = false
    folderError.value = null
    mountDir.value = props.mountDefault
    pendingSelection.value = null
    showSource('buckets')
    if (currentUser.value) void loadRemoteOwn()
    // The browser needs a session; without one the picker only offers credentials.
    if (!currentUser.value) return
    const gid = activeGroupId.value || myGroups.value[0]?.id
    if (gid) void s3.ensureSession(gid).catch(() => {})
  },
  { immediate: true },
)
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent data-tutorial="input-picker" class="max-w-xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Database class="h-4 w-4 text-primary" /> Add input reference
        </DialogTitle>
        <DialogDescription>
          Select files and folders. A folder includes all files below it. Files from databases and other buckets keep their exact version.
        </DialogDescription>
      </DialogHeader>

      <div v-if="!destination" data-tutorial="input-mount" class="max-w-sm">
        <label class="text-xs font-medium text-foreground">Mount under</label>
        <Input
          v-model="mountDir"
          class="mt-1 h-8 font-mono text-xs"
          placeholder="/work/in/"
          aria-label="Container mount directory"
          :invalid="!mountDirValid ? 'error' : undefined"
        />
        <p v-if="!mountDirValid" class="mt-1 text-[11px] text-destructive">
          Use an absolute directory path such as /work/in/.
        </p>
        <p v-else class="mt-1 text-[11px] text-muted-foreground">
          Selected files are staged below this container directory; folders keep their name as a subdirectory.
        </p>
      </div>
      <OptionToggle :model-value="source" :options="SOURCES" aria-label="Inputs from" @update:model-value="(value: string) => showSource(value as Source)" />
      <!-- Only the own buckets are browsed through an S3 session; the others use the REST listing. -->
      <template v-if="database">
        <div class="flex items-center gap-2 text-xs">
          <span class="min-w-0 flex-1 truncate font-mono text-foreground">{{ database.bucket }}</span>
          <Button variant="ghost" size="sm" @click="showSource(source)">Choose another bucket</Button>
        </div>
        <RemoteObjectPicker :bucket="database.bucket" :node-id="database.nodeId" :busy="folderBusy" @add="addRemote" />
      </template>
      <template v-else-if="source === 'buckets'">
        <Notice v-if="!s3.endpoint.value" tone="warning" class="flex items-start gap-2">
          <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>This node does not advertise an S3 endpoint, so its data cannot be browsed or referenced here.</span>
        </Notice>
        <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
          <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials are required to browse node data.</p>
          <Button v-if="currentUser" variant="outline" size="sm" @click="credentialDialogOpen = true">
            <Plus class="size-3.5" /> Create credentials
          </Button>
          <p v-else class="flex items-center gap-2"><LogIn class="h-3.5 w-3.5" /> Sign in first to create credentials.</p>
        </div>
        <ObjectBrowserPanel v-else selectable @add="addSelection" @selection-change="pendingSelection = $event" />
        <div v-if="currentUser && (remoteOwn === null || remoteOwn.length)" class="space-y-1">
          <p class="text-[11px] font-medium text-foreground">On other nodes</p>
          <p v-if="remoteOwn === null" class="text-[11px] text-muted-foreground">Listing your buckets on the other nodes…</p>
          <button
            v-for="hit in remoteOwn ?? []"
            :key="hit.bucket"
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-border px-3 py-1.5 text-left text-xs hover:bg-muted/40"
            @click="chooseBucket(hit)"
          >
            <Database class="h-3.5 w-3.5 shrink-0 text-primary" />
            <span class="min-w-0 flex-1 truncate font-mono text-foreground">{{ hit.bucket }}</span>
            <span class="shrink-0 text-muted-foreground">{{ groupName(hit.group_id) }}</span>
            <NodeLabel :node-id="hit.node_id" size="sm" class="shrink-0" />
          </button>
        </div>
      </template>
      <DatabasesTab v-else-if="source === 'databases'" bucket="" @choose="chooseDatabase" />
      <BucketSearchBox v-else mode="picker" placeholder="Find a bucket you may read…" @select="chooseBucket" />
      <div v-if="previewPaths.length" class="rounded-md border border-border bg-muted/20 px-3 py-2">
        <p class="text-[11px] font-medium text-foreground">Will be staged as</p>
        <ul class="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
          <li v-for="line in previewPaths.slice(0, PREVIEW_LIMIT)" :key="line" class="truncate" :title="line">{{ line }}</li>
          <li v-if="previewPaths.length > PREVIEW_LIMIT" class="font-sans">and {{ previewPaths.length - PREVIEW_LIMIT }} more</li>
        </ul>
      </div>
      <p v-if="folderBusy" class="mt-2 text-[11px] text-muted-foreground">Expanding selected folders…</p>
      <p v-if="folderError" class="mt-2 text-[11px] text-destructive">{{ folderError }}</p>

      <p class="text-[11px] text-muted-foreground">
        External sources (S3, HTTP, WebDAV, FTP) are referenced into a bucket first: in the
        <RouterLink :to="{ name: 'buckets' }" class="font-medium text-primary hover:underline">Data section</RouterLink>,
        use Add data &gt; From connector with the Reference strategy, then pick the referenced objects here.
      </p>

      <DialogFooter>
        <label v-if="props.copy !== undefined" class="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
          <Switch :checked="props.copy" aria-label="Copy into the workspace" @update:checked="(value: boolean) => emit('update:copy', value)" />
          <span>{{ props.copy ? 'Copies the bytes into the workspace' : 'Links only: reads stream from the source' }}</span>
        </label>
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>

      <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    </DialogContent>
  </Dialog>
</template>
