<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ObjectBrowserSkeleton from '@/components/data/ObjectBrowserSkeleton.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { useAruna } from '@/composables/useAruna'
import { useGroupSelection } from '@/composables/useGroupSelection'
import { useS3, s3ErrorMessage, isS3AuthError, isS3NetworkError, type BucketEntry, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { contextKey, shouldOpenContext } from '@/composables/s3/context'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { formatBytes, relativeTime } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { computed, ref, watch } from 'vue'
import { Boxes, Check, ChevronsUpDown, KeyRound, Link2, ShieldAlert } from '@lucide/vue'

// Read-only bucket/object browser (no uploads, deletes or routing; the Data
// Manager keeps its own richer inline browser). Two shapes:
//  - default: own bucket sidebar, clicking an object emits `select` (pickers).
//  - controlled (`bucket` prop set): browses exactly that bucket, optionally
//    on another realm node, and with `selectable` offers checkbox
//    multi-select of objects AND folders, emitting `add` with the selection.
// The session for the selected group opens on the required node by itself,
// the same way the Data view does it.
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
const { currentUser, myGroups } = useAruna()

const controlled = computed(() => props.bucket !== undefined)
const activeBucket = ref(props.bucket ?? '')
const prefix = ref(props.prefix.replace(/^\/+|\/+$/g, ''))
const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))

// The endpoint actually serving the browsed bucket (local or remote).
const effectiveEndpoint = computed(() => s3.endpointForNode(props.nodeId ?? null))
const requiredNodeId = computed(() => s3.nodeIdFor(props.nodeId ?? null))
const requiredNodeName = computed(() =>
  requiredNodeId.value ? realmNodes.displayName(requiredNodeId.value) : 'the selected node',
)

const selectedGroupId = ref(s3.activeContext.value?.groupId ?? '')
const { groupsLoading, hasGroups } = useGroupSelection(selectedGroupId)
const groupOptions = computed(() => {
  const options = myGroups.value.map((group) => ({ value: group.id, label: group.name }))
  if (selectedGroupId.value && !options.some((option) => option.value === selectedGroupId.value)) {
    options.push({ value: selectedGroupId.value, label: selectedGroupId.value })
  }
  return options
})
const selectedGroupName = computed(
  () => groupOptions.value.find((option) => option.value === selectedGroupId.value)?.label || 'Select a group',
)

const contextBusy = ref(false)
const contextError = ref<string | null>(null)
const contextReady = computed(() => {
  const context = s3.activeContext.value
  return Boolean(
    context &&
      s3.activeKey.value &&
      currentUser.value &&
      context.userId === currentUser.value.id &&
      context.nodeId === requiredNodeId.value &&
      context.groupId === selectedGroupId.value,
  )
})
const contextFingerprint = computed(() => {
  const context = contextReady.value ? s3.activeContext.value : null
  return context ? `${context.nodeId}|${context.groupId}|${context.session.accessKeyId}` : ''
})
const canBrowse = computed(() => contextReady.value && Boolean(effectiveEndpoint.value))

watch(selectedGroupId, () => {
  contextError.value = null
})

// The (group, node) pair of the last attempt that did not end in a ready
// session; only the Retry button opens it again.
let failedContextKey: string | null = null

async function openSelectedContext() {
  if (!selectedGroupId.value || !requiredNodeId.value || contextBusy.value) return
  const key = contextKey(requiredNodeId.value, selectedGroupId.value)
  contextBusy.value = true
  contextError.value = null
  try {
    // The required node mints its own session; no key crosses nodes.
    await s3.activateContext(props.nodeId ?? null, selectedGroupId.value)
  } catch (err) {
    contextError.value = s3ErrorMessage(err)
  } finally {
    contextBusy.value = false
    failedContextKey = contextReady.value ? null : key
  }
}

watch(
  [selectedGroupId, requiredNodeId, currentUser, contextReady, contextBusy],
  () => {
    const open = shouldOpenContext({
      signedIn: Boolean(currentUser.value),
      groupId: selectedGroupId.value,
      nodeId: requiredNodeId.value,
      ready: contextReady.value,
      busy: contextBusy.value,
      failedKey: failedContextKey,
    })
    if (open) void openSelectedContext()
  },
  { immediate: true },
)

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
          'The hosting node\'s S3 endpoint is unreachable from this browser, or it does not allow cross-origin browsing.'
      } else {
        listError.value = s3ErrorMessage(err)
        if (isS3AuthError(err)) emit('auth-error')
      }
    }
  } finally {
    if (requestId === listRequestId) listLoading.value = false
  }
}

// A ready session lists at once; a switched group, node or key starts over.
watch(
  [contextFingerprint, effectiveEndpoint],
  ([context, endpoint]) => {
    ++bucketRequestId
    buckets.value = []
    bucketsLoading.value = false
    bucketsError.value = null
    clearObjects()
    if (!context || !endpoint) return
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
  <div class="space-y-3">
    <!-- Same context line as the Data view header: the group switches here. -->
    <div v-if="currentUser && groupOptions.length" class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>{{ controlled ? 'Browsing as' : 'Showing buckets of' }}</span>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="inline-flex h-8 max-w-[12rem] items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/40"
            aria-label="Switch group"
          >
            <span class="truncate">{{ selectedGroupName }}</span>
            <ChevronsUpDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-64">
          <DropdownMenuLabel>Switch group</DropdownMenuLabel>
          <DropdownMenuItem
            v-for="option in groupOptions"
            :key="option.value"
            @click="selectedGroupId = option.value"
          >
            <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
            <Check v-if="option.value === selectedGroupId" class="h-3.5 w-3.5 shrink-0 text-primary" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span :title="requiredNodeId ?? undefined">on {{ requiredNodeName }}</span>
    </div>

    <EmptyState v-if="!currentUser" compact title="Sign in to browse data." />
    <Notice v-else-if="contextError && !contextReady" tone="error" class="grid min-h-[160px] place-items-center p-5 text-center">
      <div class="max-w-lg">
        <ShieldAlert class="mx-auto h-5 w-5" />
        <p class="mt-2 font-medium text-foreground">
          The session for {{ selectedGroupName }} on {{ requiredNodeName }} could not be opened
        </p>
        <p class="mt-1">{{ contextError }}</p>
        <Button variant="outline" size="sm" class="mt-3" :disabled="contextBusy" @click="openSelectedContext">
          <KeyRound class="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    </Notice>
    <!-- Never the join-a-group state while memberships are loading. -->
    <EmptyState
      v-else-if="!groupsLoading && !hasGroups"
      compact
      title="Join a group to browse data."
      description="Buckets belong to a group."
    />
    <ObjectBrowserSkeleton v-else-if="contextBusy || !contextReady" :sidebar="!controlled" />
    <EmptyState v-else-if="!effectiveEndpoint" compact title="This node does not advertise an S3 endpoint." />
    <div v-else :class="controlled ? '' : 'grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]'">
      <aside v-if="!controlled" class="overflow-hidden rounded-md border border-border">
        <header class="flex items-center justify-between border-b border-border px-3 py-2">
          <span class="text-xs font-semibold text-foreground">Buckets</span>
          <Badge variant="outline">{{ visibleBuckets.length }}</Badge>
        </header>
        <Spinner v-if="bucketsLoading" show-label label="Loading…" class="px-3 py-3" />
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
        <EmptyState v-else compact title="No buckets in this group yet." />
      </aside>

      <div class="min-w-0">
        <EmptyState v-if="!activeBucket" class="h-full" title="Select a bucket to browse its objects." />
        <template v-else>
          <div class="flex min-w-0 items-center gap-2 pb-2">
            <Breadcrumbs :bucket="activeBucket" :path="prefix" @navigate="navigateTo" />
            <Spinner v-if="listLoading" label="Loading objects" class="shrink-0" />
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
              <Badge v-if="selectedFolderCount" variant="outline" size="sm" class="ml-1">incl. folders</Badge>
            </Button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
