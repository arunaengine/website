<script setup lang="ts">
// Linked folders of one group: a backend folder shown in a bucket folder.
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import LinkedFolderDialog from '@/components/groups/LinkedFolderDialog.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { FolderSync, Pencil, Play, Plus, Trash2 } from '@lucide/vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { stateVariant } from '@/lib/stateBadge'
import { placeLabel, scheduleWords, storeName, writesElsewhere } from '@/lib/linkedFolders'
import {
  ApiError,
  deleteBackendImport,
  listBackendImports,
  runBackendImport,
  type BackendImport,
  type GroupBackendResponse,
} from '@/lib/api'
import { errorMessage, formatNumber, relativeTime } from '@/lib/utils'

const props = defineProps<{ groupId: string; backends: GroupBackendResponse[]; canAdmin: boolean }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const links = ref<BackendImport[] | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const hidden = ref(false)
const unsupported = ref(false)
const dialogOpen = ref(false)
const editing = ref<BackendImport | null>(null)
const confirmingId = ref<string | null>(null)
const busyId = ref<string | null>(null)
const expandedId = ref<string | null>(null)
const actionError = ref<string | null>(null)

// Runs that have not finished yet; the list reloads until none is left.
const ACTIVE_STATES = new Set(['queued', 'claimed', 'preparing', 'running'])
let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false

function clearPoll() {
  if (pollTimer !== undefined) clearTimeout(pollTimer)
  pollTimer = undefined
}

function schedulePoll() {
  clearPoll()
  if (disposed || !links.value?.some((link) => link.last_run && ACTIVE_STATES.has(link.last_run.state))) return
  pollTimer = setTimeout(() => void load(), 3_000)
}

// Only the latest load for the current group and session writes state.
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  const epoch = sessionEpoch.value
  const current = () => seq === loadSeq && epoch === sessionEpoch.value
  loading.value = true
  loadError.value = null
  try {
    const list = await listBackendImports(props.groupId, client())
    if (!current()) return
    links.value = list
    schedulePoll()
  } catch (err) {
    if (!current()) return
    links.value = null
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) hidden.value = true
    else if (isUnsupportedEndpoint(err)) unsupported.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (current()) loading.value = false
  }
}

watch(
  [() => props.groupId, sessionEpoch],
  () => {
    links.value = null
    hidden.value = false
    unsupported.value = false
    confirmingId.value = null
    busyId.value = null
    expandedId.value = null
    actionError.value = null
    clearPoll()
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  clearPoll()
})

// A backend folder as "name (bucket / folder)", or the folder alone for an unknown backend.
function backendPlace(backendId: string, prefix: string): string {
  const backend = props.backends.find((entry) => entry.backend_id === backendId)
  return backend ? `${backend.name} (${placeLabel(storeName(backend), prefix)})` : placeLabel(backendId, prefix)
}

function storageSide(link: BackendImport): string {
  return backendPlace(link.backend_id, link.backend_prefix)
}

function bucketSide(link: BackendImport): string {
  return placeLabel(link.bucket, link.key_prefix)
}

// New uploads go back to the linked folder unless another place was chosen.
function writeSide(link: BackendImport): string | null {
  if (!writesElsewhere(link)) return null
  return backendPlace(link.write_backend_id || link.backend_id, link.write_prefix ?? link.backend_prefix)
}

function runCounts(link: BackendImport): string {
  const run = link.last_run
  if (!run) return ''
  const parts = [`${formatNumber(run.imported)} added`]
  if (run.failed) parts.push(`${formatNumber(run.failed)} failed`)
  return parts.join(', ')
}

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(link: BackendImport) {
  editing.value = link
  dialogOpen.value = true
}

// A run or delete answer only counts for the group and session it was sent for.
function sameContext() {
  const groupId = props.groupId
  const epoch = sessionEpoch.value
  return () => groupId === props.groupId && epoch === sessionEpoch.value
}

async function run(link: BackendImport) {
  if (busyId.value) return
  const same = sameContext()
  actionError.value = null
  busyId.value = link.import_id
  try {
    await runBackendImport(props.groupId, link.import_id, client())
    if (same()) await load()
  } catch (err) {
    if (!same()) return
    const running = err instanceof ApiError && err.status === 409
    actionError.value = running ? 'This link is already running.' : errorMessage(err)
    if (running) await load()
  } finally {
    if (same()) busyId.value = null
  }
}

async function confirmDelete(link: BackendImport) {
  if (busyId.value) return
  const same = sameContext()
  actionError.value = null
  busyId.value = link.import_id
  try {
    await deleteBackendImport(props.groupId, link.import_id, client())
    if (!same()) return
    confirmingId.value = null
    await load()
  } catch (err) {
    if (same()) actionError.value = errorMessage(err)
  } finally {
    if (same()) busyId.value = null
  }
}

function onSaved(runError?: string) {
  actionError.value = runError ?? null
  void load()
}
</script>

<template>
  <div v-if="!unsupported" class="border-b border-border">
    <div class="flex items-center gap-2 px-5 pb-1 pt-4">
      <FolderSync class="h-3.5 w-3.5 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Linked folders</h2>
    </div>
    <div class="px-5 py-3">
      <p class="mb-2 text-[11px] text-muted-foreground">
        Files in your storage backend appear in Aruna, and new uploads are saved back there. Nothing is copied.
      </p>
      <div v-if="hidden" class="text-xs text-muted-foreground">
        Linked folders are only visible to group admins.
      </div>
      <Skeleton v-else-if="loading && !links" class="h-16" />
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
      <EmptyState v-else-if="links && !links.length" compact title="No linked folders.">
        <Button
          v-if="canAdmin"
          size="sm"
          :disabled="writesDisabled || !backends.length"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : !backends.length ? 'Add a storage backend first' : undefined"
          @click="openCreate"
        >
          <Plus class="h-3.5 w-3.5" /> Link a folder
        </Button>
      </EmptyState>
      <template v-else-if="links">
        <ul class="space-y-1">
          <li v-for="link in links" :key="link.import_id" class="rounded-md px-2 py-1.5 hover:bg-muted/50">
            <div class="flex flex-wrap items-center gap-2">
              <FolderSync class="h-3.5 w-3.5 shrink-0 text-primary" />
              <span
                class="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                :title="`From ${storageSide(link)} to ${bucketSide(link)}`"
              >
                From <span class="font-mono">{{ storageSide(link) }}</span>
                to <span class="font-mono">{{ bucketSide(link) }}</span>
              </span>
              <template v-if="canAdmin">
                <template v-if="confirmingId === link.import_id">
                  <span class="w-full text-xs text-foreground sm:w-auto">
                    Delete this link? Aruna never deletes files from your storage backend.
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    :disabled="writesDisabled || busyId !== null"
                    @click="confirmDelete(link)"
                  >
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" :disabled="busyId === link.import_id" @click="confirmingId = null">
                    Cancel
                  </Button>
                </template>
                <template v-else>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-6 whitespace-nowrap px-2 text-xs text-muted-foreground"
                    :aria-label="`Run ${bucketSide(link)} now`"
                    :disabled="writesDisabled || busyId !== null"
                    :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Look for new files now'"
                    @click="run(link)"
                  >
                    <Play class="h-3 w-3" /> Run now
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground"
                    :aria-label="`Edit ${bucketSide(link)}`"
                    :disabled="writesDisabled"
                    :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Change the schedule'"
                    @click="openEdit(link)"
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground"
                    :aria-label="`Delete ${bucketSide(link)}`"
                    :disabled="writesDisabled"
                    :title="writesDisabled ? OFFLINE_WRITE_HINT : 'Delete this link'"
                    @click="((confirmingId = link.import_id), (actionError = null))"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </template>
              </template>
            </div>
            <p v-if="writeSide(link)" class="mt-0.5 truncate pl-5.5 text-xs text-muted-foreground">
              New uploads saved to <span class="font-mono">{{ writeSide(link) }}</span>
            </p>
            <div class="mt-0.5 flex flex-wrap items-center gap-2 pl-5.5 text-[11px] text-muted-foreground">
              <span>{{ scheduleWords(link.schedule) }}</span>
              <template v-if="link.last_run">
                <Badge size="sm" :variant="stateVariant(link.last_run.state)" class="uppercase">
                  {{ link.last_run.state }}
                </Badge>
                <span>{{ runCounts(link) }}</span>
                <span>{{ relativeTime(link.last_run.started_at) }}</span>
                <Button
                  v-if="link.last_run.errors.length"
                  variant="ghost"
                  size="sm"
                  class="h-5 whitespace-nowrap px-1.5 text-[11px] text-muted-foreground"
                  @click="expandedId = expandedId === link.import_id ? null : link.import_id"
                >
                  {{ expandedId === link.import_id ? 'Hide failures' : 'Show failures' }}
                </Button>
              </template>
              <span v-else>Not run yet</span>
            </div>
            <ul
              v-if="expandedId === link.import_id && link.last_run"
              class="mt-1 space-y-0.5 pl-5.5 text-[11px] text-muted-foreground"
            >
              <li v-for="failure in link.last_run.errors" :key="failure.key" class="truncate">
                <span class="font-mono">{{ failure.key }}</span>: {{ failure.error }}
              </li>
            </ul>
          </li>
        </ul>
        <p v-if="actionError" class="mt-2 text-xs text-destructive">{{ actionError }}</p>
        <Button
          v-if="canAdmin"
          variant="outline"
          size="sm"
          class="mt-3"
          :disabled="writesDisabled || !backends.length"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : !backends.length ? 'Add a storage backend first' : undefined"
          @click="openCreate"
        >
          <Plus class="h-3.5 w-3.5" /> Link a folder
        </Button>
      </template>

      <LinkedFolderDialog
        v-model:open="dialogOpen"
        :group-id="props.groupId"
        :backends="props.backends"
        :link="editing"
        @saved="onSaved"
      />
    </div>
  </div>
</template>
