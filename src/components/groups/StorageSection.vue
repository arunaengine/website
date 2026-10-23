<script setup lang="ts">
// The group's storage: per storage a table of its buckets and where new buckets go, then Aruna storage.
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BucketJobLabel from '@/components/storage/BucketJobLabel.vue'
import BucketEditDialog from '@/components/groups/BucketEditDialog.vue'
import LinkBucketDialog from '@/components/groups/LinkBucketDialog.vue'
import NewBucketsDialog from '@/components/groups/NewBucketsDialog.vue'
import StorageBackendDialog from '@/components/groups/StorageBackendDialog.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Play } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  ApiError,
  getLinkStatus,
  listBackendImports,
  listStorageBuckets,
  runBackendImport,
  type BackendImport,
  type GroupBackendResponse,
  type GroupRoutingResponse,
  type StorageBucket,
} from '@/lib/api'
import { failedFiles, shownPattern, syncStatus } from '@/lib/bucketNaming'
import { storeName } from '@/lib/linkedFolders'
import { backendSchema } from '@/lib/storage'
import { defaultBucket, runActive, splitPath, splitsBuckets } from '@/lib/storageRules'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ groupId: string; groupName: string; canAdmin: boolean; focusLink?: string | null }>()
const emit = defineEmits<{
  (e: 'count', count: number): void
  (e: 'backends', backends: GroupBackendResponse[]): void
}>()

const { apiBaseUrl, authToken, sessionEpoch, listGroupBackends, getGroupRouting } = useAruna()
const { writesDisabled } = useConnectivity()

const backends = ref<GroupBackendResponse[] | null>(null)
const links = ref<BackendImport[]>([])
const routing = ref<GroupRoutingResponse | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)
const actionError = ref<string | null>(null)
const syncing = ref<string | null>(null)
// The files the last sync of one bucket did not add, shown under its row.
const problems = ref<{ id: string; files: { path: string; reason: string }[] | null } | null>(null)
// Only the newest request may fill the list.
let problemsRun = 0

const storageDialog = ref(false)
const editingStorage = ref<GroupBackendResponse | null>(null)
const newBucketsDialog = ref(false)
const linkDialog = ref(false)
const linkBackend = ref<GroupBackendResponse | null>(null)
const editDialog = ref(false)
const editing = ref<BackendImport | null>(null)
let focused: string | null = null
// The group's buckets with their storage, page by page; null on a node without the listing.
const BUCKET_PAGE = 200
const firstBuckets = ref<StorageBucket[] | null>(null)
const moreBuckets = ref<StorageBucket[]>([])
const bucketsNext = ref<string | null>(null)
const loadingMore = ref(false)
// A load or a context change ends every page request before it.
let pageRun = 0
// Pages shown, so a poll reads as many again and keeps them.
let shownPages = 1

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
function clearPoll() {
  if (pollTimer !== undefined) clearTimeout(pollTimer)
  pollTimer = undefined
}

// Reads again every few seconds while a sync runs or a step runs on any bucket shown.
function follow(imports: BackendImport[]) {
  const listed = [...(firstBuckets.value ?? []), ...moreBuckets.value]
  if (disposed || pollTimer !== undefined) return
  if (listed.some((entry) => entry.job) || imports.some((link) => runActive(link.last_run))) {
    pollTimer = setTimeout(() => void readAll(true), 3_000)
  }
}

// Only the latest load for the current group and session writes state.
let loadSeq = 0
const load = () => readAll(false)
async function readAll(poll: boolean) {
  const seq = ++loadSeq
  const epoch = sessionEpoch.value
  const current = () => seq === loadSeq && epoch === sessionEpoch.value
  loading.value = true
  loadError.value = null
  clearPoll()
  try {
    const [list, rules, imports, page] = await Promise.all([
      listGroupBackends(props.groupId),
      getGroupRouting(props.groupId),
      // A node without linked buckets still shows its storages.
      listBackendImports(props.groupId, client()).catch((err) => {
        if (isUnsupportedEndpoint(err)) return []
        throw err
      }),
      // A node without the listing shows its linked buckets only.
      listStorageBuckets(props.groupId, { limit: BUCKET_PAGE }, client()).catch((err) => {
        if (isUnsupportedEndpoint(err)) return null
        throw err
      }),
    ])
    if (!current()) return
    // A poll reads the pages shown again, one after the other from the first, and keeps them.
    let rest: StorageBucket[] = []
    let next = page?.next ?? null
    let read = 1
    while (poll && page && next && read < shownPages) {
      const more = await listStorageBuckets(props.groupId, { limit: BUCKET_PAGE, after: next }, client())
      if (!current()) return
      rest = [...rest, ...more.buckets]
      next = more.next ?? null
      read++
    }
    backends.value = list.backends
    routing.value = rules
    links.value = imports
    // A page being added now is kept; the next poll reads the pages again.
    if (!(poll && loadingMore.value)) {
      firstBuckets.value = page?.buckets ?? null
      // A refresh starts the listing over, so later pages never mix with a newer first page.
      pageRun++
      loadingMore.value = false
      moreBuckets.value = rest
      bucketsNext.value = next
      shownPages = read
    }
    if (editing.value) editing.value = imports.find((link) => link.import_id === editing.value?.import_id) ?? editing.value
    emit('count', list.backends.length)
    emit('backends', list.backends)
    follow(imports)
  } catch (err) {
    if (!current()) return
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) hidden.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (current()) loading.value = false
  }
}

watch(
  [() => props.groupId, sessionEpoch],
  () => {
    backends.value = null
    links.value = []
    routing.value = null
    hidden.value = false
    actionError.value = null
    editDialog.value = false
    editing.value = null
    focused = null
    firstBuckets.value = null
    moreBuckets.value = []
    bucketsNext.value = null
    shownPages = 1
    pageRun++
    loadingMore.value = false
    problemsRun++
    problems.value = null
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  clearPoll()
})

// A link in the address, such as from a bucket page, opens that bucket's Edit once.
watch([() => props.focusLink, links], ([id]) => {
  if (!id || id === focused) return
  const link = links.value.find((entry) => entry.import_id === id)
  if (!link) return
  focused = id
  openEdit(link)
})

async function moreBucketsPage() {
  const after = bucketsNext.value
  if (!after || loadingMore.value) return
  const run = ++pageRun
  const epoch = sessionEpoch.value
  const current = () => run === pageRun && epoch === sessionEpoch.value
  loadingMore.value = true
  try {
    const page = await listStorageBuckets(props.groupId, { limit: BUCKET_PAGE, after }, client())
    if (!current()) return
    moreBuckets.value = [...moreBuckets.value, ...page.buckets]
    bucketsNext.value = page.next ?? null
    shownPages++
    follow(links.value)
  } catch (err) {
    if (current()) actionError.value = errorMessage(err)
  } finally {
    if (current()) loadingMore.value = false
  }
}

type Row = { kind: 'link'; link: BackendImport; entry?: StorageBucket } | { kind: 'bucket'; entry: StorageBucket }

/** The rows of a storage, or of Aruna storage for null: listed buckets, then links not listed. */
function rowsOf(backendId: string | null): Row[] {
  const listed = firstBuckets.value ? [...firstBuckets.value, ...moreBuckets.value] : []
  const shown = new Set(listed.map((entry) => entry.import_id).filter(Boolean))
  const rows: Row[] = []
  for (const entry of listed) {
    if (entry.backend_id !== backendId) continue
    const link = entry.import_id ? links.value.find((candidate) => candidate.import_id === entry.import_id) : undefined
    rows.push(link ? { kind: 'link', link, entry } : { kind: 'bucket', entry })
  }
  if (backendId === null) return rows
  for (const link of links.value) {
    if (link.backend_id === backendId && !shown.has(link.import_id)) rows.push({ kind: 'link', link })
  }
  return rows
}

/** The S3 bucket of a listed bucket that is not linked. */
function bucketPlace(entry: StorageBucket): string {
  if (entry.backend_id === null) return 'on this node'
  // A storage with a fixed bucket or container names it in its connection.
  const backend = backends.value?.find((candidate) => candidate.backend_id === entry.backend_id)
  const fallback = backend ? (entry.shared ? defaultBucket(backend) : null) ?? storeName(backend) : null
  const where = [entry.provider_bucket ?? fallback, entry.folder?.replace(/\/+$/, '')].filter(Boolean).join('/')
  return entry.shared ? `${where} (shared)` : where
}

const defaultId = computed(() => routing.value?.default_target?.backend_id ?? null)

function backendOf(link: BackendImport): GroupBackendResponse | undefined {
  return backends.value?.find((backend) => backend.backend_id === link.backend_id)
}

/** The S3 bucket and folder of a link, such as "lab-raw/runs". */
function place(link: BackendImport): string {
  const backend = backendOf(link)
  if (!backend) return link.backend_prefix || '/'
  const { bucket, folder } = splitPath(backend, link.backend_prefix)
  const path = folder.replace(/\/+$/, '')
  return path ? `${bucket}/${path}` : bucket
}

/** Where new buckets go on a storage, and how their files are named. */
function newBucketsRow(backend: GroupBackendResponse): { where: string; names: string } {
  const template = routing.value?.bucket_template
  if (splitsBuckets(backend) && template) return { where: `${template} (one each)`, names: 'same as in Aruna' }
  const shared = routing.value?.bucket ?? defaultBucket(backend) ?? backend.name
  return { where: splitsBuckets(backend) ? `${shared} (shared)` : shared, names: 'chosen by Aruna' }
}

function kindLabel(backend: GroupBackendResponse): string {
  return backendSchema(backend.kind)?.label ?? backend.kind
}

function openStorage(backend: GroupBackendResponse | null) {
  editingStorage.value = backend
  storageDialog.value = true
}

function openLink(backend: GroupBackendResponse) {
  linkBackend.value = backend
  linkDialog.value = true
}

function openEdit(link: BackendImport) {
  editing.value = link
  editDialog.value = true
}

async function sync(link: BackendImport) {
  if (syncing.value) return
  actionError.value = null
  syncing.value = link.import_id
  try {
    await runBackendImport(props.groupId, link.import_id, client())
  } catch (err) {
    // 409: a sync is already running, which is what was asked for.
    if (!(err instanceof ApiError && err.status === 409)) actionError.value = errorMessage(err)
  } finally {
    syncing.value = null
    await load()
  }
}

async function showProblems(link: BackendImport) {
  if (problems.value?.id === link.import_id) {
    problemsRun++
    problems.value = null
    return
  }
  const id = link.import_id
  const asked = ++problemsRun
  const epoch = sessionEpoch.value
  problems.value = { id, files: null }
  // A node without the status route still has the errors of the run.
  const conflicts = await getLinkStatus(props.groupId, id, client())
    .then((status) => status.conflicts)
    .catch(() => [])
  if (asked === problemsRun && epoch === sessionEpoch.value) problems.value = { id, files: failedFiles(link.last_run, conflicts) }
}

function onLinked(runError?: string) {
  actionError.value = runError ?? null
  void load()
}

const offline = computed(() => (writesDisabled.value ? OFFLINE_WRITE_HINT : undefined))
const GRID =
  'grid grid-cols-[minmax(0,1fr)_1rem_minmax(0,1.2fr)_minmax(0,1.4fr)_4.5rem_6rem] items-center gap-2'
const EDIT = 'h-7 px-2 text-aruna-navy dark:text-foreground'
</script>

<template>
  <div class="px-5 py-4">
    <div class="flex items-center gap-2">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage</h2>
      <span class="flex-1" />
      <Button
        v-if="canAdmin && !hidden"
        variant="outline"
        size="sm"
        :disabled="writesDisabled"
        :title="offline"
        @click="openStorage(null)"
      >
        + Add storage
      </Button>
    </div>
    <p class="mt-1 text-xs text-muted-foreground">Where the files of this group's buckets are kept.</p>

    <div v-if="hidden" class="mt-3 text-xs text-muted-foreground">Storage is only visible to group admins.</div>
    <Skeleton v-else-if="loading && !backends" class="mt-3 h-24" />
    <ErrorPanel v-else-if="loadError" class="mt-3" :message="loadError" @retry="load" />
    <template v-else-if="backends">
      <section
        v-for="backend in backends"
        :key="backend.backend_id"
        class="mt-3 rounded-lg border border-border"
        :data-testid="`storage-${backend.backend_id}`"
      >
        <div class="flex items-center gap-2 px-3 py-2.5">
          <div class="min-w-0">
            <span class="text-sm font-semibold text-foreground">{{ backend.name }}</span>
            <Badge size="sm" variant="secondary" class="ml-1.5 uppercase">{{ kindLabel(backend) }}</Badge>
            <Badge v-if="backend.disabled" size="sm" variant="warn" class="ml-1 uppercase">removed</Badge>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ backend.public_config.endpoint ?? storeName(backend) }}</p>
          </div>
          <span class="flex-1" />
          <Button
            v-if="canAdmin"
            variant="ghost"
            size="sm"
            :class="EDIT"
            :disabled="writesDisabled"
            :title="offline ?? 'Connection settings'"
            @click="openStorage(backend)"
          >
            Edit
          </Button>
        </div>

        <div class="rounded-b-lg border-t border-border bg-muted/30 px-3 pb-2.5 pt-1.5 text-xs">
          <div
            v-if="rowsOf(backend.backend_id).length || defaultId === backend.backend_id"
            :class="[GRID, 'border-b border-border py-1 text-[11px] uppercase tracking-wide text-muted-foreground']"
          >
            <span>Aruna bucket</span><span /><span>S3 bucket</span><span>New uploads named</span><span>Synced</span><span />
          </div>
          <template v-for="row in rowsOf(backend.backend_id)" :key="row.kind === 'link' ? row.link.import_id : row.entry.bucket">
            <div v-if="row.kind === 'bucket'" :class="[GRID, 'border-b border-border py-1.5']" data-testid="bucket-row">
              <span class="flex min-w-0 items-center gap-2">
                <RouterLink :to="{ name: 'bucket', params: { bucketId: row.entry.bucket } }" class="truncate font-mono text-primary hover:underline">
                  {{ row.entry.bucket }}
                </RouterLink>
                <BucketJobLabel v-if="row.entry.job" :job="row.entry.job" />
              </span>
              <span class="text-muted-foreground">→</span>
              <span class="truncate font-mono" :title="bucketPlace(row.entry)">{{ bucketPlace(row.entry) }}</span>
              <span class="truncate text-muted-foreground">chosen by Aruna</span>
              <span /><span />
            </div>
            <div
              v-else
              :class="[GRID, 'border-b border-border py-1.5']"
              data-testid="bucket-row"
            >
              <span class="flex min-w-0 items-center gap-2">
                <RouterLink
                  :to="{ name: 'bucket', params: { bucketId: row.link.bucket } }"
                  class="truncate font-mono text-primary hover:underline"
                >
                  {{ row.link.key_prefix ? `${row.link.bucket}/${row.link.key_prefix}` : row.link.bucket }}
                </RouterLink>
                <BucketJobLabel v-if="row.entry?.job" :job="row.entry.job" />
              </span>
              <span class="text-muted-foreground">⇆</span>
              <span class="truncate font-mono" :title="place(row.link)">{{ place(row.link) }}</span>
              <span class="truncate font-mono">{{ shownPattern(row.link.write_pattern) }}</span>
              <component
                :is="['warn', 'error'].includes(syncStatus(row.link.last_run, row.link.schedule).tone) ? 'button' : 'span'"
                class="truncate text-left"
                :class="{
                  'text-emerald-700 dark:text-emerald-300': syncStatus(row.link.last_run, row.link.schedule).tone === 'ok',
                  'text-amber-700 hover:underline dark:text-amber-300': syncStatus(row.link.last_run, row.link.schedule).tone === 'warn',
                  'text-destructive hover:underline': syncStatus(row.link.last_run, row.link.schedule).tone === 'error',
                  'text-muted-foreground': syncStatus(row.link.last_run, row.link.schedule).tone === 'muted',
                }"
                :title="syncStatus(row.link.last_run, row.link.schedule).title"
                @click="['warn', 'error'].includes(syncStatus(row.link.last_run, row.link.schedule).tone) && showProblems(row.link)"
              >
                {{ syncStatus(row.link.last_run, row.link.schedule).text }}
              </component>
              <span v-if="canAdmin" class="flex justify-end gap-0.5">
                <IconButton
                  label="Sync now"
                  :disabled="writesDisabled || syncing !== null || runActive(row.link.last_run)"
                  @click="sync(row.link)"
                >
                  <Play class="size-3.5" />
                </IconButton>
                <Button variant="ghost" size="sm" :class="EDIT" title="Settings and organize" @click="openEdit(row.link)">Edit</Button>
              </span>
              <span v-else />
              <div v-if="problems?.id === row.link.import_id" class="col-span-full py-1" data-testid="sync-problems">
                <p v-if="!problems.files" class="text-muted-foreground">Loading…</p>
                <p v-else-if="!problems.files.length" class="text-muted-foreground">The node lists no files for this sync.</p>
                <ul v-else class="space-y-0.5 text-[11px]">
                  <li v-for="(file, at) in problems.files.slice(0, 20)" :key="`${at}\n${file.path}`" class="break-all">
                    <span class="font-mono">{{ file.path }}</span>: <span class="text-destructive">{{ file.reason }}</span>
                  </li>
                  <li v-if="problems.files.length > 20" class="text-muted-foreground">and {{ problems.files.length - 20 }} more</li>
                </ul>
              </div>
            </div>
          </template>
          <div
            v-if="defaultId === backend.backend_id"
            :class="[GRID, 'border-b border-dashed border-border py-1.5']"
            data-testid="new-buckets-row"
          >
            <span class="truncate text-muted-foreground">new buckets</span>
            <span class="text-muted-foreground">→</span>
            <span class="truncate font-mono">{{ newBucketsRow(backend).where }}</span>
            <span class="truncate text-muted-foreground">{{ newBucketsRow(backend).names }}</span>
            <span />
            <span class="flex justify-end">
              <Button v-if="canAdmin" variant="ghost" size="sm" :class="EDIT" title="New buckets" @click="newBucketsDialog = true">
                Edit
              </Button>
            </span>
          </div>
          <Button
            v-if="canAdmin && !backend.disabled"
            variant="outline"
            size="sm"
            class="mt-2"
            :disabled="writesDisabled"
            :title="offline"
            @click="openLink(backend)"
          >
            + Link an S3 bucket
          </Button>
        </div>
      </section>

      <section class="mt-3 rounded-lg border border-border" data-testid="aruna-storage">
        <div class="flex items-center gap-2 px-3 py-2.5">
          <div class="min-w-0">
            <span class="text-sm font-semibold text-foreground">Aruna storage</span>
            <Badge size="sm" variant="secondary" class="ml-1.5 uppercase">built in</Badge>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ defaultId ? 'Managed by Aruna on this node.' : 'Gets new buckets.' }}
            </p>
          </div>
        </div>
        <div v-if="!defaultId || rowsOf(null).length" class="rounded-b-lg border-t border-border bg-muted/30 px-3 pb-2.5 pt-1.5 text-xs">
          <div
            v-for="row in rowsOf(null)"
            :key="row.kind === 'bucket' ? row.entry.bucket : row.link.import_id"
            :class="[GRID, 'border-b border-border py-1.5']"
            data-testid="bucket-row"
          >
            <template v-if="row.kind === 'bucket'">
              <span class="flex min-w-0 items-center gap-2">
                <RouterLink :to="{ name: 'bucket', params: { bucketId: row.entry.bucket } }" class="truncate font-mono text-primary hover:underline">
                  {{ row.entry.bucket }}
                </RouterLink>
                <BucketJobLabel v-if="row.entry.job" :job="row.entry.job" />
              </span>
              <span class="text-muted-foreground">→</span>
              <span class="truncate font-mono">on this node</span>
              <span class="truncate text-muted-foreground">chosen by Aruna</span>
              <span /><span />
            </template>
          </div>
          <div v-if="!defaultId" :class="[GRID, 'py-1.5']" data-testid="new-buckets-row">
            <span class="truncate text-muted-foreground">new buckets</span>
            <span class="text-muted-foreground">→</span>
            <span class="truncate font-mono">on this node</span>
            <span class="truncate text-muted-foreground">chosen by Aruna</span>
            <span />
            <span class="flex justify-end">
              <Button v-if="canAdmin" variant="ghost" size="sm" :class="EDIT" title="New buckets" @click="newBucketsDialog = true">
                Edit
              </Button>
            </span>
          </div>
        </div>
      </section>
      <Button v-if="bucketsNext" variant="outline" size="sm" class="mt-2" :disabled="loadingMore" @click="moreBucketsPage">
        {{ loadingMore ? 'Loading…' : 'Show more buckets' }}
      </Button>
      <p v-if="actionError" class="mt-2 text-xs text-destructive">{{ actionError }}</p>
    </template>

    <StorageBackendDialog v-model:open="storageDialog" :group-id="groupId" :backend="editingStorage" @saved="load" />
    <NewBucketsDialog
      v-model:open="newBucketsDialog"
      :group-id="groupId"
      :group-name="groupName"
      :backends="backends ?? []"
      :routing="routing"
      :links="links"
      @saved="load"
    />
    <LinkBucketDialog v-model:open="linkDialog" :group-id="groupId" :backend="linkBackend" :links="links" @saved="onLinked" />
    <!-- One instance per bucket, gone when closed, so no job or poll outlives it. -->
    <BucketEditDialog
      v-if="editing && editDialog"
      :key="`${groupId}\n${editing.import_id}`"
      v-model:open="editDialog"
      :group-id="groupId"
      :link="editing"
      :storage="backendOf(editing)?.name ?? 'Storage'"
      :place="place(editing)"
      @saved="load"
    />
  </div>
</template>
