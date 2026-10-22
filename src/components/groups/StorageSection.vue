<script setup lang="ts">
// The group's storage: per storage a table of its buckets and where new buckets go, then Aruna storage.
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
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
  listBackendImports,
  runBackendImport,
  type BackendImport,
  type GroupBackendResponse,
  type GroupRoutingResponse,
} from '@/lib/api'
import { shownPattern, syncStatus } from '@/lib/bucketNaming'
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

const storageDialog = ref(false)
const editingStorage = ref<GroupBackendResponse | null>(null)
const newBucketsDialog = ref(false)
const linkDialog = ref(false)
const linkBackend = ref<GroupBackendResponse | null>(null)
const editDialog = ref(false)
const editing = ref<BackendImport | null>(null)
let focused: string | null = null

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
function clearPoll() {
  if (pollTimer !== undefined) clearTimeout(pollTimer)
  pollTimer = undefined
}

// Only the latest load for the current group and session writes state.
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  const epoch = sessionEpoch.value
  const current = () => seq === loadSeq && epoch === sessionEpoch.value
  loading.value = true
  loadError.value = null
  clearPoll()
  try {
    const [list, rules, imports] = await Promise.all([
      listGroupBackends(props.groupId),
      getGroupRouting(props.groupId),
      // A node without linked buckets still shows its storages.
      listBackendImports(props.groupId, client()).catch((err) => {
        if (isUnsupportedEndpoint(err)) return []
        throw err
      }),
    ])
    if (!current()) return
    backends.value = list.backends
    routing.value = rules
    links.value = imports
    if (editing.value) editing.value = imports.find((link) => link.import_id === editing.value?.import_id) ?? editing.value
    emit('count', list.backends.length)
    emit('backends', list.backends)
    if (!disposed && imports.some((link) => runActive(link.last_run))) pollTimer = setTimeout(() => void load(), 3_000)
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

const defaultId = computed(() => routing.value?.default_target?.backend_id ?? null)

function linksOf(backend: GroupBackendResponse): BackendImport[] {
  return links.value.filter((link) => link.backend_id === backend.backend_id)
}

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
            v-if="linksOf(backend).length || defaultId === backend.backend_id"
            :class="[GRID, 'border-b border-border py-1 text-[11px] uppercase tracking-wide text-muted-foreground']"
          >
            <span>Aruna bucket</span><span /><span>S3 bucket</span><span>New uploads named</span><span>Synced</span><span />
          </div>
          <div
            v-for="link in linksOf(backend)"
            :key="link.import_id"
            :class="[GRID, 'border-b border-border py-1.5']"
            data-testid="bucket-row"
          >
            <RouterLink
              :to="{ name: 'bucket', params: { bucketId: link.bucket } }"
              class="truncate font-mono text-primary hover:underline"
            >
              {{ link.key_prefix ? `${link.bucket}/${link.key_prefix}` : link.bucket }}
            </RouterLink>
            <span class="text-muted-foreground">⇆</span>
            <span class="truncate font-mono" :title="place(link)">{{ place(link) }}</span>
            <span class="truncate font-mono">{{ shownPattern(link.write_pattern) }}</span>
            <span
              class="truncate"
              :class="{
                'text-emerald-700 dark:text-emerald-300': syncStatus(link.last_run, link.schedule).tone === 'ok',
                'text-destructive': syncStatus(link.last_run, link.schedule).tone === 'error',
                'text-muted-foreground': syncStatus(link.last_run, link.schedule).tone === 'muted',
              }"
              :title="syncStatus(link.last_run, link.schedule).title"
            >
              {{ syncStatus(link.last_run, link.schedule).text }}
            </span>
            <span v-if="canAdmin" class="flex justify-end gap-0.5">
              <IconButton
                label="Sync now"
                :disabled="writesDisabled || syncing !== null || runActive(link.last_run)"
                @click="sync(link)"
              >
                <Play class="size-3.5" />
              </IconButton>
              <Button variant="ghost" size="sm" :class="EDIT" title="Settings and organize" @click="openEdit(link)">Edit</Button>
            </span>
            <span v-else />
          </div>
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
        <div v-if="!defaultId" class="rounded-b-lg border-t border-border bg-muted/30 px-3 pb-2.5 pt-1.5 text-xs">
          <div :class="[GRID, 'py-1.5']" data-testid="new-buckets-row">
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
