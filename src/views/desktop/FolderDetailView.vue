<script setup lang="ts">
// One bound folder, file by file. Whatever waits for the owner is at the top:
// nothing on this disk is ever replaced without a decision taken here.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import ReplaceLocalDialog from '@/components/desktop/ReplaceLocalDialog.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import {
  entryExpectation,
  folderName,
  isStaleExpectation,
  type EntryAction,
  type EntryState,
  type FolderEntry,
} from '@/lib/deviceApi'
import {
  ENTRY_META,
  entryBadge,
  entryMeta,
  entryNeedsYou,
  needsYouCount,
  orderEntries,
  replaceableCount,
} from '@/lib/syncStates'
import { formatBytes, relativeTime } from '@/lib/utils'
import { ArrowLeft, ArrowRight, FolderOpen, Link2Off, Pause, Play, RefreshCw } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { displayName } = useRealmNodes()
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
} = useSyncedFolders()

const folderId = computed(() => String(route.params.folderId ?? ''))
const folder = computed(() => folders.value.find((entry) => entry.folder_id === folderId.value) ?? null)

const rows = ref<FolderEntry[]>([])
const cursor = ref<string | null>(null)
const listState = ref<'loading' | 'ready' | 'error'>('loading')
const listError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const stateFilter = ref<EntryState | ''>('')
const replaceTarget = ref<FolderEntry | null>(null)
const replaceAction = ref<'replace_local' | 'remove_local'>('replace_local')
const replaceOpen = ref(false)
const confirmUnbind = ref(false)

const STATE_OPTIONS = [
  { value: '', label: 'All files' },
  ...Object.entries(ENTRY_META).map(([value, meta]) => ({ value, label: meta.label })),
]

const visible = computed(() => orderEntries(rows.value))
const needsYouHere = computed(() => visible.value.filter((entry) => entryNeedsYou(entry.state)))
const counters = computed(() => folder.value?.counters ?? null)
const waiting = computed(() => (counters.value ? needsYouCount(counters.value) : 0))
// A folder-wide replace covers conflicts and pending replacements; a remote
// deletion is a removal, and removals stay one file at a time.
const replaceable = computed(() => (counters.value ? replaceableCount(counters.value) : 0))

async function loadPage(reset = true): Promise<void> {
  if (!folderId.value) return
  if (reset) {
    listState.value = 'loading'
    cursor.value = null
  }
  listError.value = null
  try {
    const page = await loadEntries(folderId.value, {
      state: stateFilter.value,
      cursor: reset ? undefined : (cursor.value ?? undefined),
    })
    rows.value = reset ? page.entries : [...rows.value, ...page.entries]
    cursor.value = page.next_cursor
    listState.value = 'ready'
  } catch (err) {
    listState.value = 'error'
    listError.value = err instanceof Error ? err.message : String(err)
  }
}

/** A failed file is retried by sweeping the folder again, not by an action. */
async function retry(): Promise<void> {
  actionError.value = null
  try {
    await sync(folderId.value)
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}

async function refresh(): Promise<void> {
  actionError.value = null
  try {
    await refreshFolder(folderId.value)
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
  await loadPage()
}

onMounted(async () => {
  await ensureLoaded()
  await loadPage()
})
watch(stateFilter, () => void loadPage())
watch(folderId, () => void refresh())

async function act(entry: FolderEntry, action: EntryAction): Promise<void> {
  actionError.value = null
  const expected = entryExpectation(entry)
  if (!expected) {
    actionError.value = 'This device has not hashed that file yet, so nothing can be applied to it. Sync the folder and try again.'
    return
  }
  try {
    const updated = await entryAction(folderId.value, entry.path, action, expected)
    rows.value = rows.value.map((row) => (row.path === entry.path ? updated : row))
    await refreshFolder(folderId.value).catch(() => undefined)
  } catch (err) {
    actionError.value = isStaleExpectation(err)
      ? 'That file changed again, so nothing was applied. Refresh and look at it once more.'
      : err instanceof Error
        ? err.message
        : String(err)
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
    void router.push({ name: 'folders' })
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}

async function reveal(path: string): Promise<void> {
  actionError.value = null
  try {
    const { revealPath } = await import('@/lib/desktopBridge')
    await revealPath(path)
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}

function bytes(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : formatBytes(value)
}

function when(ms: number | null | undefined): string {
  return ms ? relativeTime(new Date(ms).toISOString()) : 'n/a'
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      :title="folder ? folderName(folder.root) : 'Folder'"
      :description="folder?.root"
    >
      <template #breadcrumbs>
        <Badge v-if="folder" variant="outline" class="text-[10px] uppercase">{{
          folder.mode === 'two_way' ? 'two-way' : 'upload only'
        }}</Badge>
        <Badge v-if="folder?.state === 'paused'" variant="secondary" class="text-[10px] uppercase">paused</Badge>
      </template>
      <template #actions>
        <RouterLink :to="{ name: 'folders' }">
          <Button variant="ghost" size="sm"><ArrowLeft class="h-3.5 w-3.5" /> Folders</Button>
        </RouterLink>
        <Button v-if="folder" variant="outline" size="sm" @click="reveal(folder.root)">
          <FolderOpen class="h-3.5 w-3.5" /> Show on disk
        </Button>
        <Button variant="outline" size="sm" :disabled="busy" @click="refresh">
          <RefreshCw class="h-3.5 w-3.5" /> Refresh
        </Button>
        <Button
          v-if="folder"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="setPaused(folder.folder_id, folder.state !== 'paused')"
        >
          <Play v-if="folder.state === 'paused'" class="h-3.5 w-3.5" />
          <Pause v-else class="h-3.5 w-3.5" />
          {{ folder.state === 'paused' ? 'Resume' : 'Pause' }}
        </Button>
        <Button v-if="folder && folder.state !== 'paused'" size="sm" :disabled="busy" @click="retry">
          Sync now
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-4 py-5">
      <p
        v-if="actionError"
        class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ actionError }}
      </p>

      <div v-if="folder" class="surface flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[11px] text-muted-foreground">
        <span class="font-mono">{{ folder.local_bucket }}</span>
        <ArrowRight class="h-3 w-3" />
        <span class="font-mono"
          >{{ displayName(folder.remote.node_id) }} · {{ folder.remote.bucket }}/{{ folder.remote.prefix }}</span
        >
        <span class="ml-auto">{{ folder.counters.in_sync }} in sync · {{ folder.counters.uploading }} uploading</span>
      </div>

      <!-- The decision band: the only place a local file can be given up. -->
      <section v-if="folder && waiting > 0" class="rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-4 py-3.5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {{ waiting }} {{ waiting === 1 ? 'file waits' : 'files wait' }} for your decision
            </h2>
            <p class="mt-0.5 text-[12px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              <span>{{ folder.counters.conflicts }} both changed</span> ·
              <span>{{ folder.counters.pending_replacements }} waiting to be replaced</span> ·
              <span>{{ folder.counters.remote_deleted }} deleted in the realm</span>. Your copies are untouched until
              you say otherwise.
            </p>
          </div>
          <Button v-if="replaceable > 0" variant="outline" size="sm" @click="openDecision(null)">
            Replace {{ replaceable }} of them…
          </Button>
        </div>
        <p v-if="folder.counters.errors" class="mt-2 text-[11px] text-amber-900/80 dark:text-amber-200/80">
          {{ folder.counters.errors }} {{ folder.counters.errors === 1 ? 'file' : 'files' }} failed and are listed
          separately.
        </p>
      </section>

      <div class="flex flex-wrap items-center gap-2">
        <Select
          v-model="stateFilter"
          class="max-w-56"
          :options="STATE_OPTIONS"
          label="State"
          aria-label="Filter entries by state"
        />
        <span v-if="needsYouHere.length" class="text-[11px] text-muted-foreground"
          >{{ needsYouHere.length }} on this page need you</span
        >
      </div>

      <div v-if="listState === 'loading'" class="space-y-2">
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
        :description="stateFilter ? 'No file in this folder is in that state.' : 'This folder holds no tracked files yet.'"
      />

      <ul v-else class="surface divide-y divide-border overflow-hidden">
        <li v-for="entry in visible" :key="entry.path" class="px-4 py-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate font-mono text-[12px] text-foreground" :title="entry.path">{{ entry.path }}</span>
                <Badge :variant="entryBadge(entry.state)" class="text-[10px]">{{
                  entryMeta(entry.state).label
                }}</Badge>
              </div>
              <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {{ entry.message || entryMeta(entry.state).hint }}
              </p>
              <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                <span>here {{ bytes(entry.local?.size) }} · {{ when(entry.local?.modified_at_ms) }}</span>
                <span>realm {{ bytes(entry.remote?.size) }} · {{ when(entry.remote?.modified_at_ms) }}</span>
                <span v-if="entry.conflicted_copy" class="truncate">copy beside it: {{ entry.conflicted_copy }}</span>
              </div>
            </div>

            <div
              v-if="entryNeedsYou(entry.state) || entry.state === 'error'"
              class="flex shrink-0 flex-wrap items-center gap-1.5"
            >
              <template v-if="entry.state === 'conflict' || entry.state === 'pending_replace'">
                <Button variant="ghost" size="sm" :disabled="busy" @click="act(entry, 'keep_local')">Keep mine</Button>
                <Button variant="outline" size="sm" :disabled="busy" @click="openDecision(entry)">Replace mine…</Button>
              </template>
              <template v-else-if="entry.state === 'remote_deleted'">
                <Button variant="ghost" size="sm" :disabled="busy" @click="act(entry, 'keep_local')">Keep mine</Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="busy"
                  @click="openDecision(entry, 'remove_local')"
                >
                  Move mine to trash…
                </Button>
              </template>
              <template v-else>
                <Button variant="ghost" size="sm" :disabled="busy" @click="act(entry, 'resolve')">Mark handled</Button>
                <Button
                  v-if="folder"
                  variant="outline"
                  size="sm"
                  :disabled="busy || folder.state === 'paused'"
                  @click="retry"
                >
                  Retry sync
                </Button>
              </template>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="cursor" class="flex justify-center">
        <Button variant="outline" size="sm" @click="loadPage(false)">Load more</Button>
      </div>

      <section v-if="folder" class="surface space-y-2 border-destructive/25 px-4 py-3.5">
        <h2 class="text-sm font-semibold text-foreground">Stop syncing this folder</h2>
        <p class="text-[12px] leading-relaxed text-muted-foreground">
          The binding is dropped and the realm keeps its versions. Every file on this disk stays exactly where it is.
        </p>
        <div class="flex items-center gap-2">
          <template v-if="!confirmUnbind">
            <Button variant="outline" size="sm" :disabled="busy" @click="confirmUnbind = true">
              <Link2Off class="h-3.5 w-3.5" /> Unbind folder
            </Button>
          </template>
          <template v-else>
            <Button variant="destructive" size="sm" :disabled="busy" @click="detach">Yes, unbind it</Button>
            <Button variant="ghost" size="sm" @click="confirmUnbind = false">Keep syncing</Button>
          </template>
        </div>
      </section>
    </div>

    <ReplaceLocalDialog
      v-if="folder"
      v-model:open="replaceOpen"
      :folder="folder"
      :entry="replaceTarget"
      :action="replaceAction"
      @replaced="refresh"
    />
  </div>
</template>
