<script setup lang="ts">
// The files inside the running kernel, cached per folder. data/ is the
// workspace bucket mounted into the kernel; everything else is scratch.
import { computed, onScopeDispose, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import NotebookCopyDialog from '@/components/notebook/NotebookCopyDialog.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useS3 } from '@/composables/useS3'
import { joinPath, useSessionFiles } from '@/composables/useSessionFiles'
import { addSessionInputs, readScratch, SCRATCH_READ_LIMIT_BYTES, type ScratchEntry } from '@/lib/notebook/session'
import { NOTEBOOK_DATA_PREFIX } from '@/lib/notebook/document'
import { parseS3Url, type TesDataRefEntry } from '@/lib/tes'
import { errorMessage, formatBytes } from '@/lib/utils'
import {
  ChevronRight,
  CloudDownload,
  Copy,
  Download,
  EllipsisVertical,
  FileText,
  Folder,
  FolderPlus,
  PanelLeft,
  Plus,
  RefreshCw,
} from '@lucide/vue'

/** The kernel folder the bucket is mounted under; only it can be written from here. */
const DATA_FOLDER = NOTEBOOK_DATA_PREFIX.replace(/\/$/, '')
const OUTSIDE_DATA = `Only ${DATA_FOLDER}/ is stored in the bucket`
const TOO_LARGE = `Larger than ${formatBytes(SCRATCH_READ_LIMIT_BYTES)}, so the kernel cannot hand it out`
/** A folder is copied object by object; the bound keeps one click from moving an archive. */
const COPY_FOLDER_LIMIT = 500

interface TreeRow {
  path: string
  name: string
  kind: ScratchEntry['kind'] | 'note'
  bytes: number
  depth: number
}

/** What Copy to bucket moves: the keys under a data/ folder, one data/ key, or a scratch file. */
interface CopySource {
  path: string
  name: string
  kind: ScratchEntry['kind']
  keys: string[]
}

defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ (event: 'toggle'): void }>()

const { notebook, session } = injectNotebook()
const s3 = useS3()
const files = useSessionFiles(session)

const note = ref<string | null>(null)
const error = ref<string | null>(null)

/** The folder a staging dialog was opened from. */
const target = ref(DATA_FOLDER)
const addOpen = ref(false)
const importOpen = ref(false)
const staging = ref(false)
const dataKeys = ref<ReadonlySet<string>>(new Set())

const creating = ref<string | null>(null)
const newName = ref('')

const copyOpen = ref(false)
const copySource = ref<CopySource | null>(null)
const copyBusy = ref(false)

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
  copyBusy.value = false
  note.value = null
  error.value = null
  target.value = DATA_FOLDER
  dataKeys.value = new Set()
  creating.value = null
  addOpen.value = false
  importOpen.value = false
  copyOpen.value = false
}, { flush: 'sync' })

function inData(path: string): boolean {
  return path === DATA_FOLDER || path.startsWith(`${DATA_FOLDER}/`)
}

const root = computed(() => files.directory(''))

/** The open part of the tree, one row per shown entry; dot files are the helper's. */
const rows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = []
  const walk = (folder: string, depth: number) => {
    const known = files.directory(folder)
    if (!known) return
    if (known.error && !known.entries) {
      out.push({ path: `${folder}#error`, name: known.error, kind: 'note', bytes: 0, depth })
      return
    }
    const entries = (known.entries ?? [])
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name))
    for (const entry of entries) {
      const path = joinPath(folder, entry.name)
      out.push({ path, name: entry.name, kind: entry.kind, bytes: entry.bytes, depth })
      if (entry.kind === 'dir' && files.expanded.value.has(path)) walk(path, depth + 1)
    }
  }
  walk('', 0)
  return out
})

function indent(depth: number) {
  return { paddingLeft: `${depth * 16}px` }
}

function stageReason(path: string): string | null {
  if (!inData(path)) return OUTSIDE_DATA
  return session.live.value ? null : 'The kernel is starting'
}

function copyReason(row: TreeRow): string | null {
  if (inData(row.path)) return null
  if (row.kind === 'dir') return OUTSIDE_DATA
  return row.bytes < SCRATCH_READ_LIMIT_BYTES ? null : TOO_LARGE
}

/** Keys under the import target, so the import warns before it overwrites one. */
async function loadDataKeys() {
  if (!bucket.value) return
  const active = current()
  try {
    const page = await s3.listObjects(bucket.value, `${target.value}/`)
    if (!active()) return
    dataKeys.value = new Set(page.objects.map((object) => object.key))
  } catch {
    if (!active()) return
    dataKeys.value = new Set()
  }
}

function openAdd(folder: string) {
  target.value = folder
  addOpen.value = true
}

function openImport(folder: string) {
  target.value = folder
  importOpen.value = true
  void loadDataKeys()
}

function onImported() {
  files.refresh(target.value)
}

function startFolder(folder: string) {
  creating.value = folder
  newName.value = ''
}

/** Puts the zero-byte marker key into the bucket; the mount shows it at once. */
async function commitFolder() {
  const folder = creating.value
  const name = newName.value.trim()
  creating.value = null
  if (folder === null || !name || name.includes('/') || name === '.' || name === '..') return
  const active = current()
  error.value = null
  try {
    await s3.createFolder(bucket.value, `${folder}/`, name)
    if (!active()) return
    files.refresh(folder)
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
  }
}

/** Saves one small scratch file; the bearer rules out a plain link. */
async function download(path: string, name: string) {
  if (!session.jobId.value) return
  const active = current()
  error.value = null
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
    if (active()) error.value = errorMessage(cause)
  }
}

/** Stages picked objects into the workspace bucket, under the folder the menu was opened on. */
async function stage(entry: TesDataRefEntry) {
  if (!session.jobId.value) return
  const active = current()
  const cellId = notebook.activeCellId.value
  const folder = target.value
  const items =
    entry.kind === 'file'
      ? (() => {
          const parsed = parseS3Url(entry.url)
          return parsed
            ? [{ bucket: parsed.bucket, key: parsed.key, dest_key: joinPath(folder, entry.name) }]
            : []
        })()
      : entry.files.map((file) => ({
          bucket: entry.bucket,
          key: file.key,
          dest_key: joinPath(folder, `${entry.name}/${file.name}`),
        }))
  if (!items.length) return
  staging.value = true
  error.value = null
  try {
    const result = await addSessionInputs(session.jobId.value, items, session.client.value)
    if (!active()) return
    const failed = result.failed ?? []
    if (result.staged.length) files.refresh(folder)
    if (cellId && result.staged.length) {
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
    if (failed.length) error.value = `${failed.length} of ${items.length} files failed: ${failed[0].error}`
  } catch (cause) {
    if (!active()) return
    error.value = errorMessage(cause)
  } finally {
    if (active()) staging.value = false
  }
}

/** Opens the destination picker; a folder is listed first so the count is known. */
async function startCopy(row: TreeRow) {
  if (row.kind === 'note' || copyReason(row)) return
  const active = current()
  error.value = null
  let keys = inData(row.path) ? [row.path] : []
  if (row.kind === 'dir') {
    try {
      const listing = await s3.listObjectsRecursive(bucket.value, `${row.path}/`, COPY_FOLDER_LIMIT)
      if (!active()) return
      if (listing.truncated) {
        error.value = `${row.name}/ holds more than ${COPY_FOLDER_LIMIT} files. Copy a smaller folder.`
        return
      }
      if (!listing.objects.length) {
        error.value = `${row.name}/ holds no files.`
        return
      }
      keys = listing.objects.map((object) => object.key)
    } catch (cause) {
      if (active()) error.value = errorMessage(cause)
      return
    }
  }
  copySource.value = { path: row.path, name: row.name, kind: row.kind, keys }
  copyOpen.value = true
}

async function copyTo(destination: { bucket: string; prefix: string }) {
  const source = copySource.value
  if (!source || copyBusy.value) return
  const active = current()
  copyBusy.value = true
  error.value = null
  note.value = null
  const where = `${destination.bucket}/${destination.prefix}`
  try {
    if (source.kind === 'dir') {
      for (const key of source.keys) {
        const relative = key.slice(source.path.length + 1)
        await s3.copyObject({ bucket: bucket.value, key }, destination.bucket, `${destination.prefix}${source.name}/${relative}`)
        if (!active()) return
      }
    } else if (source.keys.length) {
      await s3.copyObject({ bucket: bucket.value, key: source.path }, destination.bucket, `${destination.prefix}${source.name}`)
    } else {
      if (!session.jobId.value) return
      const blob = await readScratch(session.jobId.value, source.path, session.client.value)
      if (!active()) return
      const file = new File([blob], source.name, { type: blob.type })
      await s3.uploadObject(destination.bucket, `${destination.prefix}${source.name}`, file).promise
    }
    if (!active()) return
    copyOpen.value = false
    note.value = source.kind === 'dir'
      ? `Copied ${source.keys.length} files from ${source.name}/ to ${where}${source.name}/.`
      : `Copied ${source.name} to ${where}.`
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
  } finally {
    if (active()) copyBusy.value = false
  }
}
</script>

<template>
  <aside class="surface min-w-0 overflow-hidden">
    <header class="flex h-12 items-center gap-1 border-b border-border" :class="collapsed ? 'px-2' : 'px-4'">
      <h2 v-if="!collapsed" class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Files</h2>
      <IconButton v-if="!collapsed && session.running.value" label="Refresh kernel files" @click="files.refresh()">
        <RefreshCw class="size-4" />
      </IconButton>
      <IconButton :label="collapsed ? 'Expand files' : 'Collapse files'" :aria-expanded="!collapsed" @click="emit('toggle')"><PanelLeft class="size-4" /></IconButton>
    </header>

    <div v-if="!collapsed" class="space-y-3 px-4 pb-4 pt-3">
      <Notice v-if="note" tone="info">{{ note }}</Notice>
      <Notice v-if="error" tone="error">{{ error }}</Notice>

      <EmptyState v-if="!session.running.value" compact title="Not running." description="Start a session to see the files inside the kernel." />
      <p v-else-if="root?.starting || (!root?.entries && !root?.error && !session.live.value)" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner /> The kernel is starting.
      </p>
      <p v-else-if="!root?.entries && !root?.error" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner /> Reading the kernel files.
      </p>
      <div v-else class="min-w-0 space-y-0.5 text-xs">
        <template v-for="row in rows" :key="row.path">
          <div class="group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/40" :style="indent(row.depth)">
            <template v-if="row.kind === 'dir'">
              <button
                type="button"
                class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                :aria-expanded="files.expanded.value.has(row.path)"
                :aria-label="`${files.expanded.value.has(row.path) ? 'Collapse' : 'Expand'} ${row.name}`"
                @click="files.toggle(row.path)"
              >
                <ChevronRight :class="['h-3 w-3 transition-transform', files.expanded.value.has(row.path) && 'rotate-90']" />
              </button>
              <Folder class="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span class="truncate font-mono text-foreground" :title="row.name">{{ row.name }}/</span>
              <Spinner v-if="files.directory(row.path)?.loading" />
            </template>
            <span v-else-if="row.kind === 'note'" class="truncate px-1 text-destructive">{{ row.name }}</span>
            <template v-else>
              <span class="w-4 shrink-0" />
              <FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate font-mono text-foreground" :title="row.name">{{ row.name }}</span>
              <span class="shrink-0 text-[10px] text-muted-foreground">{{ formatBytes(row.bytes) }}</span>
            </template>

            <span v-if="row.kind !== 'note'" class="ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-sm" class="h-5 w-5" :title="`Actions for ${row.name}`" :aria-label="`Actions for ${row.name}`">
                    <EllipsisVertical class="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="min-w-[12rem]" @close-auto-focus="(e: Event) => e.preventDefault()">
                  <template v-if="row.kind === 'dir'">
                    <DropdownMenuItem class="text-xs" :disabled="!inData(row.path)" :title="inData(row.path) ? undefined : OUTSIDE_DATA" @select="startFolder(row.path)">
                      <FolderPlus class="size-3.5 text-muted-foreground" /> New folder
                    </DropdownMenuItem>
                    <DropdownMenuItem class="text-xs" :disabled="Boolean(stageReason(row.path)) || staging" :title="stageReason(row.path) ?? undefined" @select="openAdd(row.path)">
                      <Plus class="size-3.5 text-muted-foreground" /> Add files from buckets
                    </DropdownMenuItem>
                    <DropdownMenuItem class="text-xs" :disabled="!inData(row.path)" :title="inData(row.path) ? undefined : OUTSIDE_DATA" @select="openImport(row.path)">
                      <CloudDownload class="size-3.5 text-muted-foreground" /> Import from connector
                    </DropdownMenuItem>
                  </template>
                  <DropdownMenuItem v-else class="text-xs" :disabled="row.bytes >= SCRATCH_READ_LIMIT_BYTES" :title="row.bytes >= SCRATCH_READ_LIMIT_BYTES ? TOO_LARGE : undefined" @select="download(row.path, row.name)">
                    <Download class="size-3.5 text-muted-foreground" /> Download
                  </DropdownMenuItem>
                  <DropdownMenuItem class="text-xs" :disabled="Boolean(copyReason(row)) || copyBusy" :title="copyReason(row) ?? undefined" @select="startCopy(row)">
                    <Copy class="size-3.5 text-muted-foreground" /> Copy to bucket
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>

          <!-- Inline name row for a new folder. -->
          <div v-if="creating === row.path" class="flex items-center gap-1.5 py-0.5" :style="indent(row.depth + 1)">
            <Folder class="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <Input
              v-model="newName"
              class="h-6 w-44 font-mono text-xs"
              placeholder="folder-name"
              aria-label="New folder name"
              autofocus
              @keydown.enter.prevent="commitFolder"
              @keydown.esc.prevent="creating = null"
              @blur="commitFolder"
            />
          </div>
        </template>
        <p v-if="!rows.length" class="py-2 text-muted-foreground">The kernel folder is empty.</p>
      </div>
    </div>

    <TesDataRefDialog v-model:open="addOpen" mode="input" :destination="`${bucket}/${target}/`" @add="stage" />

    <!-- The data manager's own import, pointed at the picked data/ folder. -->
    <AddDataDialog
      v-model:open="importOpen"
      :bucket="bucket"
      :prefix="`${target}/`"
      :group-id="notebook.meta.value?.group_id ?? null"
      :existing-keys="dataKeys"
      @staged="onImported"
    />

    <NotebookCopyDialog
      v-model:open="copyOpen"
      :source="copySource?.name ?? ''"
      :count="copySource?.keys.length || 1"
      :group-id="notebook.meta.value?.group_id ?? null"
      :busy="copyBusy"
      @copy="copyTo"
    />
  </aside>
</template>
