<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { useS3, s3ErrorMessage, isS3AuthError, isS3NetworkError, type BucketEntry, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { formatBytes, relativeTime } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { computed, ref, watch } from 'vue'
import { Boxes, KeyRound, Link2, Loader2 } from '@lucide/vue'

// Read-only bucket/object browser (no uploads, deletes or routing — the Data
// Manager keeps its own richer inline browser). Two shapes:
//  - default: own bucket sidebar, clicking an object emits `select` (pickers).
//  - controlled (`bucket` prop set): browses exactly that bucket, optionally
//    on another realm node after an explicit node-local session switch, and
//    with `selectable` offers checkbox multi-select of objects
//    AND folders, emitting `add` with the selection.
const props = withDefaults(
  defineProps<{
    /** Controlled mode: browse exactly this bucket and hide the bucket sidebar. */
    bucket?: string
    /** Folder the browser opens on; read once, later navigation owns the location. */
    prefix?: string
    /** Node hosting the browsed bucket; null = the connected node. */
    nodeId?: string | null
    /** Checkbox multi-select of objects and folders (emits `add`). */
    selectable?: boolean
  }>(),
  { bucket: undefined, prefix: '', nodeId: null, selectable: false },
)

const emit = defineEmits<{
  (e: 'select', entry: { bucket: string; key: string; name: string; size?: number }): void
  (e: 'add', selection: { bucket: string; objects: ObjectEntry[]; folders: FolderEntry[] }): void
  /** Selectable mode only: fires on every checkbox change (live previews). */
  (e: 'selection-change', selection: { bucket: string; objects: ObjectEntry[]; folders: FolderEntry[] }): void
  (e: 'auth-error'): void
  /** Fires on every location change; empty bucket = the bucket overview. */
  (e: 'navigate', location: { bucket: string; prefix: string }): void
}>()

const s3 = useS3()
const realmNodes = useRealmNodes()

const controlled = computed(() => props.bucket !== undefined)
const activeBucket = ref(props.bucket ?? '')
const prefix = ref(props.prefix.replace(/^\/+|\/+$/g, ''))
const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))

// The endpoint actually serving the browsed bucket (local or remote).
const effectiveEndpoint = computed(() => s3.endpointForNode(props.nodeId ?? null))
const contextMismatch = computed(() => s3.contextMismatch(props.nodeId ?? null))
const requiredNodeId = computed(() => s3.nodeIdFor(props.nodeId ?? null))
const canBrowse = computed(() =>
  Boolean(s3.hasActiveKey.value && effectiveEndpoint.value && !contextMismatch.value),
)
const switchBusy = ref(false)
const switchError = ref<string | null>(null)

async function openOnThisNode() {
  const groupId = s3.activeContext.value?.groupId
  if (!groupId || switchBusy.value) return
  switchBusy.value = true
  switchError.value = null
  try {
    await s3.activateContext(props.nodeId ?? null, groupId)
  } catch (err) {
    switchError.value = s3ErrorMessage(err)
  } finally {
    switchBusy.value = false
  }
}

// Reference-backed rows get the same subtle marker as the Data Manager
// listing. The staging-references listing only covers the connected node, so
// remote browsing skips it.
const references = useStagingReferences(
  activeBucket,
  computed(() => !props.nodeId),
)

const buckets = ref<BucketEntry[]>([])
const bucketsLoading = ref(false)
const bucketsError = ref<string | null>(null)

// Pickers never offer per-run ws-<jobId> scratch buckets.
const visibleBuckets = computed(() => buckets.value.filter((entry) => !isWorkspaceBucket(entry.name)))

const folders = ref<FolderEntry[]>([])
const objects = ref<ObjectEntry[]>([])
const nextToken = ref<string | undefined>(undefined)
const listLoading = ref(false)
const listError = ref<string | null>(null)

// Multi-select (selectable mode): keyed by object key / folder prefix, kept
// across folder navigation within the same bucket.
type SelectionEntry =
  | { kind: 'object'; object: ObjectEntry }
  | { kind: 'folder'; folder: FolderEntry }
const selected = ref<Map<string, SelectionEntry>>(new Map())

// Stale responses are dropped via a request id (same pattern as DataManagerView).
let bucketRequestId = 0
let listRequestId = 0

// Folder-level pickers need the browsed location, not just picked files.
watch(
  [activeBucket, s3Prefix],
  ([bucket, prefix]) => emit('navigate', { bucket, prefix }),
  { immediate: true },
)

function clearObjects() {
  ++listRequestId
  folders.value = []
  objects.value = []
  nextToken.value = undefined
  listLoading.value = false
  listError.value = null
}

async function refreshBuckets() {
  if (controlled.value) return
  if (!canBrowse.value) return
  const requestId = ++bucketRequestId
  bucketsLoading.value = true
  bucketsError.value = null
  try {
    const entries = await s3.listBuckets()
    if (requestId !== bucketRequestId) return
    buckets.value = entries
  } catch (err) {
    if (requestId === bucketRequestId) {
      bucketsError.value = s3ErrorMessage(err)
      buckets.value = []
      if (isS3AuthError(err)) emit('auth-error')
    }
  } finally {
    if (requestId === bucketRequestId) bucketsLoading.value = false
  }
}

async function loadObjects(more = false) {
  if (!canBrowse.value || !activeBucket.value) return
  const requestId = ++listRequestId
  const targetBucket = activeBucket.value
  const targetPrefix = s3Prefix.value
  const targetNode = props.nodeId ?? null
  const continuation = more ? nextToken.value : undefined
  listLoading.value = true
  listError.value = null
  try {
    const page = await s3.listObjects(targetBucket, targetPrefix, continuation, targetNode)
    if (requestId !== listRequestId) return
    folders.value = more ? [...folders.value, ...page.folders] : page.folders
    objects.value = more ? [...objects.value, ...page.objects] : page.objects
    nextToken.value = page.nextToken
  } catch (err) {
    if (requestId === listRequestId) {
      if (targetNode && isS3NetworkError(err)) {
        listError.value =
          'The hosting node\'s S3 endpoint did not answer this browser. It may be unreachable or not allow cross-origin browsing.'
      } else {
        listError.value = s3ErrorMessage(err)
        if (isS3AuthError(err)) emit('auth-error')
      }
    }
  } finally {
    if (requestId === listRequestId) listLoading.value = false
  }
}

watch(
  [() => s3.activeKey.value?.accessKeyId, effectiveEndpoint, contextMismatch],
  ([key, endpoint, mismatch]) => {
    ++bucketRequestId
    buckets.value = []
    bucketsLoading.value = false
    bucketsError.value = null
    clearObjects()
    if (!key || !endpoint || mismatch) {
      return
    }
    void refreshBuckets()
    if (activeBucket.value) void loadObjects()
  },
  { immediate: true },
)

// Controlled mode: the parent switches the browsed bucket/node.
watch(
  [() => props.bucket, () => props.nodeId],
  ([bucket]) => {
    if (!controlled.value) return
    activeBucket.value = bucket ?? ''
    prefix.value = ''
    selected.value = new Map()
    clearObjects()
    if (activeBucket.value) void loadObjects()
  },
)

function openBucket(name: string) {
  clearObjects()
  activeBucket.value = name
  prefix.value = ''
  selected.value = new Map()
  void loadObjects()
}

function navigateTo(path: string) {
  clearObjects()
  prefix.value = path
  void loadObjects()
}

function openFolder(folder: FolderEntry) {
  navigateTo(folder.prefix.replace(/\/$/, ''))
}

function pick(object: ObjectEntry) {
  if (props.selectable) {
    toggleObject(object, !selected.value.has(object.key))
    return
  }
  emit('select', { bucket: activeBucket.value, key: object.key, name: object.name, size: object.size })
}

function toggleObject(object: ObjectEntry, checked: boolean) {
  const next = new Map(selected.value)
  if (checked) next.set(object.key, { kind: 'object', object })
  else next.delete(object.key)
  selected.value = next
}

function toggleFolder(folder: FolderEntry, checked: boolean) {
  const next = new Map(selected.value)
  if (checked) next.set(folder.prefix, { kind: 'folder', folder })
  else next.delete(folder.prefix)
  selected.value = next
}

const selectedList = computed(() => [...selected.value.values()])
const selectedFolderCount = computed(
  () => selectedList.value.filter((entry) => entry.kind === 'folder').length,
)

function selectionSnapshot(): { bucket: string; objects: ObjectEntry[]; folders: FolderEntry[] } {
  return {
    bucket: activeBucket.value,
    objects: selectedList.value
      .filter((entry): entry is Extract<SelectionEntry, { kind: 'object' }> => entry.kind === 'object')
      .map((entry) => entry.object),
    folders: selectedList.value
      .filter((entry): entry is Extract<SelectionEntry, { kind: 'folder' }> => entry.kind === 'folder')
      .map((entry) => entry.folder),
  }
}

watch(selected, () => {
  if (props.selectable) emit('selection-change', selectionSnapshot())
})

function addSelected() {
  const snapshot = selectionSnapshot()
  if (!snapshot.objects.length && !snapshot.folders.length) return
  emit('add', snapshot)
  selected.value = new Map()
}

const isEmpty = computed(
  () => !listLoading.value && !listError.value && !folders.value.length && !objects.value.length,
)
</script>

<template>
  <div :class="controlled ? '' : 'grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]'">
    <aside v-if="!controlled" class="overflow-hidden rounded-md border border-border">
      <header class="flex items-center justify-between border-b border-border px-3 py-2">
        <span class="text-xs font-semibold text-foreground">Buckets</span>
        <Badge variant="outline">{{ visibleBuckets.length }}</Badge>
      </header>
      <div v-if="bucketsLoading" class="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
      <p v-else-if="bucketsError" class="px-3 py-2 text-xs text-destructive">{{ bucketsError }}</p>
      <ul v-else-if="visibleBuckets.length" class="max-h-[260px] overflow-y-auto py-1">
        <li v-for="entry in visibleBuckets" :key="entry.name">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
            :class="entry.name === activeBucket ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
            @click="openBucket(entry.name)"
          >
            <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
            <span class="truncate">{{ entry.name }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="px-3 py-3 text-xs text-muted-foreground">No buckets in this group yet.</p>
    </aside>

    <div class="min-w-0">
      <div v-if="contextMismatch" class="grid min-h-[160px] place-items-center rounded-md border border-amber-500/30 bg-amber-500/5 p-5 text-center text-xs">
        <div class="max-w-lg">
          <KeyRound class="mx-auto h-5 w-5 text-amber-700 dark:text-amber-300" />
          <p class="mt-2 font-medium text-foreground">Open a session on the required node</p>
          <p class="mt-1 text-muted-foreground">
            The active session was issued by {{ realmNodes.displayName(contextMismatch.issuerNodeId) }} ({{ contextMismatch.issuerNodeId }}). This bucket requires {{ realmNodes.displayName(contextMismatch.requiredNodeId) }} ({{ contextMismatch.requiredNodeId }}). Browsing and selection stay disabled until the node-local session is opened.
          </p>
          <Button class="mt-3" size="sm" :disabled="switchBusy || !s3.activeContext.value?.groupId" @click="openOnThisNode">
            <Loader2 v-if="switchBusy" class="h-3.5 w-3.5 animate-spin" />
            <KeyRound v-else class="h-3.5 w-3.5" /> Open on this node
          </Button>
          <p v-if="switchError" class="mt-2 text-destructive">{{ switchError }}</p>
        </div>
      </div>
      <div v-else-if="!s3.hasActiveKey.value" class="grid min-h-[160px] place-items-center rounded-md border border-border bg-muted/20 p-5 text-center text-xs">
        <div class="max-w-lg">
          <KeyRound class="mx-auto h-5 w-5 text-muted-foreground" />
          <p class="mt-2 font-medium text-foreground">A valid temporary S3 session is required</p>
          <p class="mt-1 text-muted-foreground">
            The session is missing or expired. Open the same explicit group on {{ requiredNodeId ? realmNodes.displayName(requiredNodeId) : 'the selected node' }} before browsing.
          </p>
          <Button class="mt-3" size="sm" :disabled="switchBusy || !s3.activeContext.value?.groupId" @click="openOnThisNode">
            <Loader2 v-if="switchBusy" class="h-3.5 w-3.5 animate-spin" />
            <KeyRound v-else class="h-3.5 w-3.5" /> Open group
          </Button>
          <p v-if="switchError" class="mt-2 text-destructive">{{ switchError }}</p>
        </div>
      </div>
      <div v-else-if="!activeBucket" class="grid h-full min-h-[160px] place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        Select a bucket to browse its objects.
      </div>
      <template v-else>
        <div class="flex min-w-0 items-center gap-2 pb-2">
          <Breadcrumbs :bucket="activeBucket" :path="prefix" @navigate="navigateTo" />
          <Loader2 v-if="listLoading" class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        </div>
        <div class="overflow-hidden rounded-md border border-border">
          <p v-if="listError" class="border-b border-border px-3 py-2 text-xs text-destructive">{{ listError }}</p>
          <div tabindex="0" role="region" aria-label="Objects" class="max-h-[260px] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th v-if="selectable" class="w-8 px-3 py-1.5"></th>
                  <th scope="col" class="px-3 py-1.5 text-left font-semibold">Name</th>
                  <th scope="col" class="px-3 py-1.5 text-right font-semibold">Size</th>
                  <th scope="col" class="px-3 py-1.5 text-left font-semibold">Modified</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="folder in folders"
                  :key="folder.prefix"
                  class="cursor-pointer border-t border-border hover:bg-muted/50"
                  @click="openFolder(folder)"
                >
                  <td v-if="selectable" class="w-8 px-3 py-2" @click.stop>
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-border accent-primary"
                      :checked="selected.has(folder.prefix)"
                      :aria-label="`Select folder ${folder.name}`"
                      @change="toggleFolder(folder, ($event.target as HTMLInputElement).checked)"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <span class="flex items-center gap-2 text-xs">
                      <ObjectIcon :name="folder.name" folder class="h-4 w-4" /> {{ folder.name }}/
<!-- Tooltip lives on a span: title on inline svg is unreliable. -->
                      <span
                        v-if="references.prefixHasReferences(folder.prefix)"
                        class="shrink-0"
                        title="Contains objects referenced from an external source"
                      >
                        <Link2
                          class="h-3 w-3 text-primary/40"
                          aria-label="Contains objects referenced from an external source"
                        />
                      </span>
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right text-xs text-muted-foreground">-</td>
                  <td class="px-3 py-2 text-xs text-muted-foreground">-</td>
                </tr>
                <tr
                  v-for="object in objects"
                  :key="object.key"
                  class="cursor-pointer border-t border-border hover:bg-muted/30"
                  @click="pick(object)"
                >
                  <td v-if="selectable" class="w-8 px-3 py-2" @click.stop>
                    <input
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-border accent-primary"
                      :checked="selected.has(object.key)"
                      :aria-label="`Select ${object.name}`"
                      @change="toggleObject(object, ($event.target as HTMLInputElement).checked)"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <span class="flex items-center gap-2 text-xs">
                      <ObjectIcon :name="object.name" class="h-4 w-4" /> <span class="truncate">{{ object.name }}</span>
<span
                        v-if="references.keyIsReferenced(object.key)"
                        class="shrink-0"
                        title="Referenced from an external source"
                      >
                        <Link2
                          class="h-3 w-3 text-primary/40"
                          aria-label="Referenced from an external source"
                        />
                      </span>
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{{ object.size !== undefined ? formatBytes(object.size) : '-' }}</td>
                  <td class="px-3 py-2 text-xs text-muted-foreground">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '-' }}</td>
                </tr>
                <tr v-if="isEmpty">
                  <td :colspan="selectable ? 4 : 3" class="px-3 py-6 text-center text-xs text-muted-foreground">This prefix is empty.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="nextToken" class="border-t border-border px-3 py-1.5">
            <Button variant="ghost" size="sm" :disabled="listLoading" @click="loadObjects(true)">Load more</Button>
          </div>
        </div>

        <div v-if="selectable" class="mt-2 flex items-center justify-between gap-2">
          <span class="text-[11px] text-muted-foreground">
            {{ selectedList.length ? `${selectedList.length} selected` : 'Select objects or folders.' }}
          </span>
          <Button size="sm" :disabled="!selectedList.length" @click="addSelected">
            Add {{ selectedList.length || '' }}
            <Badge v-if="selectedFolderCount" variant="outline" class="ml-1 text-[10px]">incl. folders</Badge>
          </Button>
        </div>
      </template>
    </div>
  </div>
</template>
