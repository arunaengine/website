<script setup lang="ts">
// The files inside the running kernel, cached per folder, and the workspace
// bucket behind them; imports and picked objects go into data/.
import { computed, onScopeDispose, ref, watch } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useS3 } from '@/composables/useS3'
import { joinPath, useSessionFiles } from '@/composables/useSessionFiles'
import { addSessionInputs, readScratch, SCRATCH_READ_LIMIT_BYTES, type ScratchEntry } from '@/lib/notebook/session'
import { NOTEBOOK_DATA_PREFIX } from '@/lib/notebook/document'
import { parseS3Url, type TesDataRefEntry } from '@/lib/tes'
import { errorMessage, formatBytes } from '@/lib/utils'
import { ChevronDown, ChevronRight, CloudDownload, Download, File, Folder, PanelLeft, Plus, RefreshCw } from '@lucide/vue'

const VIEWS = [
  { value: 'kernel', label: 'Kernel' },
  { value: 'bucket', label: 'Bucket' },
]
/** The kernel folder the bucket is mounted under; only it receives staged files. */
const DATA_FOLDER = NOTEBOOK_DATA_PREFIX.replace(/\/$/, '')

interface TreeRow {
  path: string
  name: string
  kind: ScratchEntry['kind'] | 'note'
  bytes: number
  depth: number
}

defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ (event: 'toggle'): void }>()

const { notebook, session } = injectNotebook()
const s3 = useS3()
const files = useSessionFiles(session)

const view = ref('kernel')
const selectedFolder = ref(DATA_FOLDER)
const readError = ref<string | null>(null)

const importOpen = ref(false)
// Remounts the browser after an import, which has no reload of its own.
const panelRevision = ref(0)
const dataKeys = ref<ReadonlySet<string>>(new Set())
const addOpen = ref(false)
const staging = ref(false)
const stageNote = ref<string | null>(null)

const bucket = computed(() => notebook.meta.value?.workspace_bucket ?? '')
let disposed = false
onScopeDispose(() => { disposed = true })

function current() {
  const generation = notebook.generation.value
  const jobId = session.jobId.value
  return () => !disposed && generation === notebook.generation.value && jobId === session.jobId.value
}

watch([notebook.generation, session.jobId], () => {
  staging.value = false
  stageNote.value = null
  readError.value = null
  selectedFolder.value = DATA_FOLDER
  dataKeys.value = new Set()
  importOpen.value = false
  addOpen.value = false
}, { flush: 'sync' })

/** Keys under data/, so the import warns before it overwrites one. */
async function loadDataKeys() {
  if (!bucket.value) return
  const active = current()
  try {
    const page = await s3.listObjects(bucket.value, NOTEBOOK_DATA_PREFIX)
    if (!active()) return
    dataKeys.value = new Set(page.objects.map((object) => object.key))
  } catch {
    if (!active()) return
    dataKeys.value = new Set()
  }
}

function onImported() {
  panelRevision.value += 1
  files.refresh(DATA_FOLDER)
  void loadDataKeys()
}

function inData(path: string): boolean {
  return path === DATA_FOLDER || path.startsWith(`${DATA_FOLDER}/`)
}

/** Where Add files puts copies: the picked folder inside data/, else data/ itself. */
const stageFolder = computed(() => (inData(selectedFolder.value) ? selectedFolder.value : DATA_FOLDER))
const root = computed(() => files.directory(''))

/** The open part of the tree, one row per shown entry. */
const rows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = []
  const walk = (folder: string, depth: number) => {
    const known = files.directory(folder)
    if (!known) return
    if (known.error && !known.entries) {
      out.push({ path: `${folder}#error`, name: known.error, kind: 'note', bytes: 0, depth })
      return
    }
    const entries = [...(known.entries ?? [])].sort(
      (a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name),
    )
    for (const entry of entries) {
      const path = joinPath(folder, entry.name)
      out.push({ path, name: entry.name, kind: entry.kind, bytes: entry.bytes, depth })
      if (entry.kind === 'dir' && files.expanded.value.has(path)) walk(path, depth + 1)
    }
  }
  walk('', 0)
  return out
})

function selectFolder(path: string) {
  selectedFolder.value = path
  files.toggle(path)
}

/** Saves one small scratch file; the bearer rules out a plain link. */
async function download(path: string, name: string) {
  if (!session.jobId.value) return
  const active = current()
  readError.value = null
  try {
    const blob = await readScratch(session.jobId.value, path, session.client.value)
    if (!active()) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  } catch (cause) {
    if (active()) readError.value = errorMessage(cause)
  }
}

/** Stages picked objects into the workspace bucket, under the picked data/ folder. */
async function stage(entry: TesDataRefEntry) {
  if (!session.jobId.value) return
  const active = current()
  const cellId = notebook.activeCellId.value
  const target = stageFolder.value
  const items =
    entry.kind === 'file'
      ? (() => {
          const parsed = parseS3Url(entry.url)
          return parsed
            ? [{ bucket: parsed.bucket, key: parsed.key, dest_key: joinPath(target, entry.name) }]
            : []
        })()
      : entry.files.map((file) => ({
          bucket: entry.bucket,
          key: file.key,
          dest_key: joinPath(target, `${entry.name}/${file.name}`),
        }))
  if (!items.length) return
  staging.value = true
  stageNote.value = null
  try {
    const result = await addSessionInputs(session.jobId.value, items, session.client.value)
    if (!active()) return
    const staged = result.staged.length
    const failed = result.failed ?? []
    if (staged) {
      panelRevision.value += 1
      files.refresh(target)
    }
    if (cellId && staged) {
      notebook.noteCellInputs(
        cellId,
        result.staged.map((file) => ({
          dest_key: file.dest_key,
          source_node_id: file.source_node_id,
          version_id: file.version_id,
          blake3: file.blake3,
        })),
      )
    }
    const failure = failed.length ? ` ${failed.length} failed: ${failed[0].error}` : ''
    stageNote.value = staged
      ? `${staged} of ${items.length} files are now in ${target}/.${failure}${cellId ? '' : ' Select a cell first to record them on it.'}`
      : failed.length
        ? `No file landed.${failure}`
        : 'The copy was started; the files appear in the bucket when they land.'
  } catch (cause) {
    if (!active()) return
    stageNote.value = errorMessage(cause)
  } finally {
    if (active()) staging.value = false
  }
}
</script>

<template>
  <aside class="surface min-w-0 overflow-hidden">
    <header class="flex h-12 items-center gap-1 border-b border-border" :class="collapsed ? 'px-2' : 'px-4'">
      <h2 v-if="!collapsed" class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Files</h2>
      <IconButton v-if="!collapsed && session.live.value" label="Add files" :disabled="staging" @click="addOpen = true">
        <Plus class="size-4" />
      </IconButton>
      <IconButton v-if="!collapsed && bucket" label="Import into data/" @click="importOpen = true; loadDataKeys()">
        <CloudDownload class="size-4" />
      </IconButton>
      <IconButton v-if="!collapsed && view === 'kernel' && session.running.value" label="Refresh kernel files" @click="files.refresh()">
        <RefreshCw class="size-4" />
      </IconButton>
      <IconButton :label="collapsed ? 'Expand files' : 'Collapse files'" :aria-expanded="!collapsed" @click="emit('toggle')"><PanelLeft class="size-4" /></IconButton>
    </header>

    <div v-if="!collapsed" class="space-y-3 px-4 pb-4 pt-3">
      <OptionToggle v-model="view" :options="VIEWS" aria-label="Files to show" />
      <Notice v-if="stageNote" tone="info">{{ stageNote }}</Notice>
      <Notice v-if="readError" tone="error">{{ readError }}</Notice>

      <div v-if="view === 'kernel'" class="min-w-0 space-y-2">
        <p v-if="session.live.value" class="text-xs text-muted-foreground">
          Add files copies into <span class="font-mono">{{ stageFolder }}/</span>.
          <template v-if="selectedFolder !== stageFolder">Only {{ DATA_FOLDER }}/ receives staged files.</template>
        </p>
        <EmptyState v-if="!session.running.value" compact title="Not running." description="Start a session to see the files inside the kernel." />
        <p v-else-if="root?.starting || (!root?.entries && !root?.error && !session.live.value)" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner /> The kernel is starting.
        </p>
        <p v-else-if="!root?.entries && !root?.error" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner /> Reading the kernel files.
        </p>
        <ul v-else class="text-xs" aria-label="Kernel files">
          <li v-for="row in rows" :key="row.path" class="flex min-w-0 items-center gap-1 py-0.5" :style="{ paddingLeft: `${row.depth * 0.75}rem` }">
            <button
              v-if="row.kind === 'dir'"
              type="button"
              class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left hover:bg-muted"
              :class="selectedFolder === row.path ? 'bg-muted' : ''"
              :aria-expanded="files.expanded.value.has(row.path)"
              :aria-current="selectedFolder === row.path ? 'true' : undefined"
              @click="selectFolder(row.path)"
            >
              <ChevronDown v-if="files.expanded.value.has(row.path)" class="size-3 shrink-0 text-muted-foreground" />
              <ChevronRight v-else class="size-3 shrink-0 text-muted-foreground" />
              <Folder class="size-4 shrink-0 text-aruna-royal" />
              <span class="truncate" :title="row.name">{{ row.name }}/</span>
              <Spinner v-if="files.directory(row.path)?.loading" class="ml-auto" />
            </button>
            <span v-else-if="row.kind === 'note'" class="truncate px-1 text-destructive">{{ row.name }}</span>
            <template v-else>
              <span class="flex h-7 min-w-0 flex-1 items-center gap-1.5 px-1">
                <File class="size-4 shrink-0 text-muted-foreground" />
                <span class="truncate" :title="row.name">{{ row.name }}</span>
              </span>
              <span class="shrink-0 font-mono text-muted-foreground">{{ formatBytes(row.bytes) }}</span>
              <IconButton v-if="row.bytes < SCRATCH_READ_LIMIT_BYTES" size="icon-sm" :label="`Download ${row.name}`" @click="download(row.path, row.name)">
                <Download class="size-3.5" />
              </IconButton>
            </template>
          </li>
          <li v-if="!rows.length" class="py-2 text-muted-foreground">The kernel folder is empty.</li>
        </ul>
      </div>

      <div v-else class="min-w-0 overflow-auto">
        <ObjectBrowserPanel v-if="bucket" :key="panelRevision" flush :bucket="bucket" :group-id="notebook.meta.value?.group_id" />
        <p v-else class="text-xs text-muted-foreground">This notebook has no workspace bucket yet.</p>
      </div>
    </div>

    <TesDataRefDialog v-model:open="addOpen" mode="input" :destination="`${bucket}/${stageFolder}/`" @add="stage" />

    <!-- The data manager's own import, pointed at the notebook's data folder. -->
    <AddDataDialog
      v-model:open="importOpen"
      :bucket="bucket"
      :prefix="NOTEBOOK_DATA_PREFIX"
      :group-id="notebook.meta.value?.group_id ?? null"
      :existing-keys="dataKeys"
      @staged="onImported"
    />

  </aside>
</template>
