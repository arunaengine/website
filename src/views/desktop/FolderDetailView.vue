<script setup lang="ts">
// One bound folder, file by file. Whatever waits for the owner is at the top:
// nothing on this disk is ever replaced without a decision taken here.
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import FolderHistory from '@/components/desktop/FolderHistory.vue'
import ReplaceLocalDialog from '@/components/desktop/ReplaceLocalDialog.vue'
import StopSyncDialog from '@/components/desktop/StopSyncDialog.vue'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRefresh } from '@/composables/useRefresh'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import {
  entryExpectation,
  folderName,
  isMoving,
  isStaleExpectation,
  type EntryAction,
  type EntryState,
  type FolderEntry,
} from '@/lib/deviceApi'
import {
  entryBadge,
  entryMeta,
  entryNeedsYou,
  modeLabel,
  needsYouCount,
  orderEntries,
  replaceableCount,
  transferLabel,
  transferPercent,
} from '@/lib/syncStates'
import { stateVariant } from '@/lib/stateBadge'
import { errorMessage, formatBytes, relativeTime } from '@/lib/utils'
import { ArrowLeft, ExternalLink, FolderOpen, Pause, Play, RotateCw } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { displayName, isLocalNode } = useRealmNodes()
const {
  folders,
  ensureLoaded,
  refreshFolder,
  entries: loadEntries,
  entryAction,
  setPaused,
  sync,
  unbind,
  busy,
  actionErrors,
} = useSyncedFolders()
const { all: transfers } = useDeviceTransfers()

const folderId = computed(() => String(route.params.folderId ?? ''))
const folder = computed(() => folders.value.find((entry) => entry.folder_id === folderId.value) ?? null)

const rows = ref<FolderEntry[]>([])
// Each state a chip asks for pages on its own; one chip can ask for several.
const cursors = ref<Record<string, string | null>>({})
const listState = ref<'loading' | 'ready' | 'error'>('loading')
const loadingMore = ref(false)
const listError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const filter = ref('all')
const replaceTarget = ref<FolderEntry | null>(null)
const replaceAction = ref<'replace_local' | 'remove_local'>('replace_local')
const replaceOpen = ref(false)
const stopOpen = ref(false)
const history = useTemplateRef<{ reload: () => Promise<void> }>('history')

const counters = computed(() => folder.value?.counters ?? null)
const waiting = computed(() => (counters.value ? needsYouCount(counters.value) : 0))
// A folder-wide replace covers conflicts and pending replacements; a remote
// deletion is a removal, and removals stay one file at a time.
const replaceable = computed(() => (counters.value ? replaceableCount(counters.value) : 0))

// The states a chip stands for, and the node's own tally where it keeps one.
const FILTERS: Array<{ value: string; label: string; states: Array<EntryState | ''>; count?: (c: NonNullable<typeof counters.value>) => number }> = [
  { value: 'all', label: 'All', states: [''] },
  { value: 'synced', label: 'Synced', states: ['in_sync'], count: (c) => c.in_sync },
  { value: 'sending', label: 'Sending', states: ['local_new', 'local_changed', 'local_deleted'], count: (c) => c.uploading },
  { value: 'receiving', label: 'Receiving', states: ['remote_new', 'remote_changed'] },
  { value: 'needs', label: 'Needs you', states: ['conflict', 'pending_replace', 'remote_deleted'], count: needsYouCount },
  { value: 'failed', label: 'Failed', states: ['error'], count: (c) => c.errors },
]

const chips = computed(() =>
  FILTERS.filter((chip) => chip.value !== 'receiving' || folder.value?.mode !== 'upload_only').map((chip) => ({
    value: chip.value,
    label: chip.label,
    ...(chip.count && counters.value ? { count: chip.count(counters.value) } : {}),
  })),
)
const filterStates = computed<Array<EntryState | ''>>(
  () => FILTERS.find((chip) => chip.value === filter.value)?.states ?? [''],
)
const hasMore = computed(() => filterStates.value.some((state) => cursors.value[state]))

const visible = computed(() => orderEntries(rows.value, movingByPath.value))

// A file the node is moving right now shows its progress.
const movingByPath = computed(
  () =>
    new Map(
      transfers.value
        .filter((transfer) => transfer.folder_id === folderId.value && isMoving(transfer))
        .map((transfer) => [transfer.path, transfer]),
    ),
)

// Bumped on every fresh read, so an answer for another folder or filter is dropped.
let generation = 0
// True once the owner loaded more pages, which a quiet reload would drop again.
let extended = false

async function loadPage(reset = true): Promise<void> {
  const folder = folderId.value
  if (!folder || (!reset && loadingMore.value)) return
  const asked = reset ? filterStates.value : filterStates.value.filter((state) => cursors.value[state])
  const mine = reset ? ++generation : generation
  if (reset) {
    listState.value = 'loading'
    cursors.value = {}
  } else {
    loadingMore.value = true
  }
  listError.value = null
  try {
    const pages = await Promise.all(
      asked.map((state) =>
        loadEntries(folder, { state, cursor: reset ? undefined : (cursors.value[state] ?? undefined) }),
      ),
    )
    if (mine !== generation || folder !== folderId.value) return
    const found = pages.flatMap((page) => page.entries)
    rows.value = reset ? found : [...rows.value, ...found]
    extended = !reset
    asked.forEach((state, index) => (cursors.value = { ...cursors.value, [state]: pages[index]?.next_cursor ?? null }))
    listState.value = 'ready'
  } catch (err) {
    if (mine !== generation || folder !== folderId.value) return
    listState.value = 'error'
    listError.value = errorMessage(err)
  } finally {
    if (!reset) loadingMore.value = false
  }
}

/** A failed file is retried by sweeping the folder again; the list is read afterwards. */
async function retry(): Promise<void> {
  actionError.value = null
  try {
    await sync(folderId.value)
  } catch (err) {
    actionError.value = errorMessage(err)
  }
  await refresh()
}

async function refresh(): Promise<void> {
  actionError.value = null
  try {
    await refreshFolder(folderId.value)
  } catch (err) {
    actionError.value = errorMessage(err)
  }
  await loadPage()
  await history.value?.reload()
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refresh)

onMounted(async () => {
  await ensureLoaded()
  await loadPage()
})
watch(filter, () => void loadPage())
// A sent file changes its row, so the rows follow the file in flight without a skeleton.
watch(
  () => [...movingByPath.value.keys()].join('\n'),
  () => {
    if (!extended && !loadingMore.value) void loadPage()
  },
)
// Another folder starts from nothing: no row of the last one stays under its actions.
watch(folderId, () => {
  rows.value = []
  cursors.value = {}
  filter.value = 'all'
  void refresh()
})

async function act(entry: FolderEntry, action: EntryAction): Promise<void> {
  actionError.value = null
  const folder = folderId.value
  const expected = entryExpectation(entry)
  if (!expected) {
    actionError.value = 'This computer has not hashed that file yet, so nothing can be applied to it. Sync the folder and try again.'
    return
  }
  try {
    const updated = await entryAction(folder, entry.path, action, expected)
    // The owner may have moved to another folder while the node answered.
    if (folder !== folderId.value) return
    rows.value = rows.value.map((row) => (row.path === entry.path ? updated : row))
    await refreshFolder(folder).catch(() => undefined)
    await history.value?.reload()
  } catch (err) {
    actionError.value = isStaleExpectation(err)
      ? 'That file changed again, so nothing was applied. Refresh and look at it once more.'
      : errorMessage(err)
  }
}

// Every path that gives up local bytes goes through the dialog, so the owner
// sees both copies before deciding.
function openDecision(entry: FolderEntry | null, action: 'replace_local' | 'remove_local' = 'replace_local'): void {
  replaceTarget.value = entry
  replaceAction.value = action
  replaceOpen.value = true
}

async function detach(): Promise<void> {
  actionError.value = null
  try {
    await unbind(folderId.value)
    stopOpen.value = false
    void router.push({ name: 'device' })
  } catch (err) {
    stopOpen.value = false
    actionError.value = errorMessage(err)
  }
}

async function reveal(path: string): Promise<void> {
  actionError.value = null
  try {
    const { revealPath } = await import('@/lib/desktopBridge')
    await revealPath(path)
  } catch (err) {
    actionError.value = errorMessage(err)
  }
}

function bytes(value: number | null | undefined, missing: string): string {
  return value === null || value === undefined ? missing : formatBytes(value)
}

function when(ms: number | null | undefined): string {
  return ms ? relativeTime(new Date(ms).toISOString()) : ''
}

function side(entrySide: FolderEntry['local'], missing: string): string {
  if (!entrySide) return missing
  return [bytes(entrySide.size, missing), when(entrySide.modified_at_ms)].filter(Boolean).join(' · ')
}

function progressText(path: string): string {
  const transfer = movingByPath.value.get(path)
  if (!transfer || transferPercent(transfer) === null || transfer.bytes_total === null || transfer.bytes_done === null) return ''
  const verb = transfer.direction === 'upload' ? 'sent' : 'received'
  return `${formatBytes(transfer.bytes_done)} of ${formatBytes(transfer.bytes_total)} ${verb}.`
}

function chipLabel(entry: FolderEntry): string {
  const transfer = movingByPath.value.get(entry.path)
  if (!transfer) return entryMeta(entry.state).label
  const percent = transferPercent(transfer)
  return `${transferLabel(transfer)}${percent === null ? '' : ` ${percent}%`}`
}

const bucketLink = computed(() => {
  const current = folder.value
  if (!current) return null
  const node = isLocalNode(current.remote.node_id) ? null : current.remote.node_id
  return {
    name: 'bucket',
    params: { bucketId: current.remote.bucket },
    query: { ...(node ? { node } : {}), ...(current.group_id ? { group: current.group_id } : {}) },
  }
})

const filesText = computed(() => {
  const c = counters.value
  if (!c) return ''
  const parts = [`${c.in_sync} in sync`]
  if (c.uploading) parts.push(`${c.uploading} sending`)
  if (c.errors) parts.push(`${c.errors} failed`)
  return parts.join(' · ')
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      :title="folder ? folderName(folder.root) : 'Folder'"
      :description="folder?.root"
      :docs="{ topic: 'where-data-lives', section: 'Syncs' }"
    >
      <template #breadcrumbs>
        <Badge v-if="folder" variant="outline" size="sm" class="uppercase">{{ modeLabel(folder.mode) }}</Badge>
        <Badge v-if="folder?.state === 'paused'" variant="secondary" size="sm" class="uppercase">paused</Badge>
        <Badge v-if="folder?.state === 'deleting'" variant="sky" size="sm" class="uppercase">deleting</Badge>
        <Badge v-if="folder?.state === 'binding'" variant="sky" size="sm" class="uppercase">linking</Badge>
      </template>
      <template #actions>
        <Button variant="ghost" size="sm" as-child>
          <RouterLink :to="{ name: 'device' }"><ArrowLeft class="h-3.5 w-3.5" /> This computer</RouterLink>
        </Button>
        <Button v-if="folder" variant="outline" size="sm" @click="reveal(folder.root)">
          <FolderOpen class="h-3.5 w-3.5" /> Show on disk
        </Button>
        <RefreshButton :busy="refreshBusy" :disabled="busy" @click="onRefresh" />
        <Button
          v-if="folder && folder.state !== 'deleting' && folder.state !== 'binding'"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="setPaused(folder.folder_id, folder.state !== 'paused')"
        >
          <Play v-if="folder.state === 'paused'" class="h-3.5 w-3.5" />
          <Pause v-else class="h-3.5 w-3.5" />
          {{ folder.state === 'paused' ? 'Resume' : 'Pause' }}
        </Button>
        <Button
          v-if="folder && folder.state !== 'paused' && folder.state !== 'deleting' && folder.state !== 'binding'"
          size="sm"
          :disabled="busy"
          @click="retry"
        >
          Sync now
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-4 py-5">
      <RefusalNote v-if="folder?.last_error" :message="folder.last_error" />
      <RefusalNote
        v-if="actionErrors.get(folderId) && actionErrors.get(folderId) !== folder?.last_error"
        :message="actionErrors.get(folderId) || ''"
      />
      <RefusalNote
        v-if="actionError && actionError !== actionErrors.get(folderId) && actionError !== folder?.last_error"
        :message="actionError"
      />

      <dl v-if="folder" class="grid gap-3 md:grid-cols-3">
        <div class="surface px-4 py-3">
          <dt class="text-[10px] uppercase tracking-wide text-muted-foreground">On this computer</dt>
          <dd class="mt-0.5 truncate font-mono text-xs text-foreground" :title="folder.root">{{ folder.root }}</dd>
        </div>
        <div class="surface px-4 py-3">
          <dt class="text-[10px] uppercase tracking-wide text-muted-foreground">In Aruna</dt>
          <dd class="mt-0.5 truncate text-sm text-foreground">
            <RouterLink v-if="bucketLink" :to="bucketLink" class="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              {{ folder.remote.bucket }}<template v-if="folder.remote.prefix">/{{ folder.remote.prefix }}</template>
              <ExternalLink class="h-3 w-3" />
            </RouterLink>
            on {{ displayName(folder.remote.node_id) }}
          </dd>
        </div>
        <div class="surface px-4 py-3">
          <dt class="text-[10px] uppercase tracking-wide text-muted-foreground">Files</dt>
          <dd class="mt-0.5 text-sm text-foreground">{{ filesText }}</dd>
        </div>
      </dl>

      <!-- The decision band: the only place a local file can be given up. -->
      <Notice v-if="folder && waiting > 0" tone="warning">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-sm font-semibold">
              {{ waiting }} {{ waiting === 1 ? 'file waits' : 'files wait' }} for your decision
            </h2>
            <p class="mt-0.5">
              Your {{ waiting === 1 ? 'copy is' : 'copies are' }} untouched until you choose.
              <template v-if="folder.counters.errors">
                {{ folder.counters.errors }} {{ folder.counters.errors === 1 ? 'file' : 'files' }} failed and
                {{ folder.counters.errors === 1 ? 'is' : 'are' }} listed below.
              </template>
            </p>
          </div>
          <Button v-if="replaceable > 0" variant="outline" size="sm" @click="openDecision(null)">
            Replace {{ replaceable }} of them…
          </Button>
        </div>
      </Notice>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="min-w-0 space-y-3">
          <FilterChips v-model="filter" :options="chips" aria-label="Filter files" />

          <div v-if="listState === 'loading' && !rows.length" class="space-y-2">
            <Skeleton v-for="n in 4" :key="n" class="h-12" />
          </div>

          <ErrorPanel
            v-else-if="listState === 'error'"
            :message="listError || 'The files in this folder could not be listed.'"
            @retry="loadPage"
          />

          <EmptyState
            v-else-if="!visible.length"
            title="Nothing to show"
            :description="filter !== 'all' ? 'No file in this folder is in that state.' : 'This folder holds no tracked files yet.'"
          />

          <ul v-else class="surface divide-y divide-border overflow-hidden">
            <li v-for="entry in visible" :key="entry.path" class="px-4 py-3">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate font-mono text-[12px] text-foreground" :title="entry.path">{{ entry.path }}</span>
                    <Badge
                      :variant="movingByPath.has(entry.path) ? stateVariant('running') : entryBadge(entry.state)"
                      size="sm"
                    >{{ chipLabel(entry) }}</Badge>
                  </div>
                  <p class="mt-0.5 text-[11px] leading-relaxed" :class="entry.state === 'error' ? 'text-destructive' : 'text-muted-foreground'">
                    {{ progressText(entry.path) || entry.message || entryMeta(entry.state).hint }}
                  </p>
                  <Progress
                    v-if="movingByPath.has(entry.path)"
                    :value="transferPercent(movingByPath.get(entry.path)!) ?? 0"
                    :indeterminate="transferPercent(movingByPath.get(entry.path)!) === null"
                    :label="entry.path"
                    :warn="101"
                    :critical="101"
                    class="mt-1.5 h-1.5 w-56"
                  />
                  <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                    <span>here {{ side(entry.local, 'not on this computer') }}</span>
                    <span>Aruna {{ side(entry.remote, 'not there yet') }}</span>
                    <span v-if="entry.conflicted_copy" class="truncate">other copy: {{ entry.conflicted_copy }}</span>
                  </div>
                </div>

                <div
                  v-if="entryNeedsYou(entry.state) || entry.state === 'error'"
                  class="flex shrink-0 flex-wrap items-center gap-1.5"
                >
                  <template v-if="entry.state === 'conflict' || entry.state === 'pending_replace'">
                    <Button variant="ghost" size="sm" :disabled="busy" @click="act(entry, 'keep_local')">Keep mine</Button>
                    <Button v-if="entry.state === 'conflict'" variant="outline" size="sm" :disabled="busy" @click="act(entry, 'resolve')">
                      Keep both
                    </Button>
                    <Button variant="outline" size="sm" :disabled="busy" @click="openDecision(entry)">Use the Aruna one…</Button>
                  </template>
                  <template v-else-if="entry.state === 'remote_deleted'">
                    <Button variant="ghost" size="sm" :disabled="busy" @click="act(entry, 'keep_local')">Keep mine</Button>
                    <Button variant="outline" size="sm" :disabled="busy" @click="openDecision(entry, 'remove_local')">
                      Move mine to trash…
                    </Button>
                  </template>
                  <template v-else>
                    <Button variant="ghost" size="sm" :disabled="busy" @click="act(entry, 'resolve')">Mark handled</Button>
                    <Button v-if="folder" variant="outline" size="sm" :disabled="busy || folder.state === 'paused'" @click="retry">
                      <RotateCw class="h-3.5 w-3.5" /> Retry
                    </Button>
                  </template>
                </div>
              </div>
            </li>
          </ul>

          <div v-if="hasMore" class="flex justify-center">
            <Button variant="ghost" size="sm" :disabled="loadingMore" :aria-busy="loadingMore" @click="loadPage(false)">
              <Spinner v-if="loadingMore" label="Loading more files" class="text-current" /> Load more
            </Button>
          </div>
        </div>

        <aside v-if="folder" class="space-y-4">
          <FolderHistory ref="history" :folder-id="folder.folder_id" :mode="folder.mode" :started-ms="folder.created_at_ms" />

          <section v-if="folder.state !== 'deleting'" class="surface space-y-2 border-destructive/25 px-4 py-3.5">
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Stop syncing this folder</h2>
            <p class="text-[12px] leading-relaxed text-muted-foreground">
              The files on this computer stay where they are. Aruna keeps its copies.
            </p>
            <Button variant="outline" size="sm" :disabled="busy" @click="stopOpen = true">Stop syncing…</Button>
          </section>
        </aside>
      </div>
    </div>

    <ReplaceLocalDialog
      v-if="folder"
      v-model:open="replaceOpen"
      :folder="folder"
      :entry="replaceTarget"
      :action="replaceAction"
      @replaced="refresh"
    />
    <StopSyncDialog
      v-if="folder"
      v-model:open="stopOpen"
      :name="folderName(folder.root)"
      :bucket="folder.remote.bucket"
      :sending="folder.counters.uploading"
      :busy="busy"
      @confirm="detach"
    />
  </div>
</template>
