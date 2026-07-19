<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { useS3, s3ErrorMessage, isS3AuthError, isS3NetworkError, type BucketEntry, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { formatBytes, relativeTime } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { computed, ref, watch } from 'vue'
import { Boxes, Link2, Loader2 } from '@lucide/vue'

// Read-only bucket/object browser (no uploads, deletes or routing — the Data
// Manager keeps its own richer inline browser). Two shapes:
//  - default: own bucket sidebar, clicking an object emits `select` (pickers).
//  - controlled (`bucket` prop set): browses exactly that bucket — optionally
//    on another realm node via `nodeId` (same realm-wide key, per-node S3
//    client) — and with `selectable` offers checkbox multi-select of objects
//    AND folders, emitting `add` with the selection.
const props = withDefaults(
  defineProps<{
    /** Controlled mode: browse exactly this bucket and hide the bucket sidebar. */
    bucket?: string
    /** Node hosting the browsed bucket; null = the connected node. */
    nodeId?: string | null
    /** Checkbox multi-select of objects and folders (emits `add`). */
    selectable?: boolean
  }>(),
  { bucket: undefined, nodeId: null, selectable: false },
)

const emit = defineEmits<{
  (e: 'select', entry: { bucket: string; key: string; name: string; size?: number }): void
  (e: 'add', selection: { objects: ObjectEntry[]; folders: FolderEntry[] }): void
  (e: 'auth-error'): void
  /** Fires on every location change; empty bucket = the bucket overview. */
  (e: 'navigate', location: { bucket: string; prefix: string }): void
}>()

const s3 = useS3()

const controlled = computed(() => props.bucket !== undefined)
const activeBucket = ref(props.bucket ?? '')
const prefix = ref('')
const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))

// The endpoint actually serving the browsed bucket (local or remote).
const effectiveEndpoint = computed(() => s3.endpointForNode(props.nodeId ?? null))

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
  if (!s3.hasActiveKey.value || !s3.endpoint.value) return
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
  if (!s3.hasActiveKey.value || !effectiveEndpoint.value || !activeBucket.value) return
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
  [() => s3.activeKey.value, effectiveEndpoint],
  ([key, endpoint]) => {
    ++bucketRequestId
    buckets.value = []
    bucketsLoading.value = false
    bucketsError.value = null
    clearObjects()
    if (!key || !endpoint) {
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

function addSelected() {
  const objectEntries = selectedList.value
    .filter((entry): entry is Extract<SelectionEntry, { kind: 'object' }> => entry.kind === 'object')
    .map((entry) => entry.object)
  const folderEntries = selectedList.value
    .filter((entry): entry is Extract<SelectionEntry, { kind: 'folder' }> => entry.kind === 'folder')
    .map((entry) => entry.folder)
  if (!objectEntries.length && !folderEntries.length) return
  emit('add', { objects: objectEntries, folders: folderEntries })
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
      <div v-if="!activeBucket" class="grid h-full min-h-[160px] place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        Select a bucket to browse its objects.
      </div>
      <template v-else>
        <div class="flex min-w-0 items-center gap-2 pb-2">
          <Breadcrumbs :bucket="activeBucket" :path="prefix" @navigate="navigateTo" />
          <Loader2 v-if="listLoading" class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        </div>
        <div class="overflow-hidden rounded-md border border-border">
          <p v-if="listError" class="border-b border-border px-3 py-2 text-xs text-destructive">{{ listError }}</p>
          <div class="max-h-[260px] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th v-if="selectable" class="w-8 px-3 py-1.5"></th>
                  <th class="px-3 py-1.5 text-left font-semibold">Name</th>
                  <th class="px-3 py-1.5 text-right font-semibold">Size</th>
                  <th class="px-3 py-1.5 text-left font-semibold">Modified</th>
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
