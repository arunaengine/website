<script setup lang="ts">
// The files inside the running kernel, cached per folder. data/ is the
// workspace bucket mounted into the kernel; everything else is scratch.
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import NotebookCopyDialog from '@/components/notebook/NotebookCopyDialog.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useS3 } from '@/composables/useS3'
import { joinPath, parentPath, useSessionFiles } from '@/composables/useSessionFiles'
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
  Pencil,
  Play,
  Plus,
  Trash2,
} from '@lucide/vue'

/** The kernel folder the bucket is mounted under; only it can be written from here. */
const DATA_FOLDER = NOTEBOOK_DATA_PREFIX.replace(/\/$/, '')
const OUTSIDE_DATA = `Only ${DATA_FOLDER}/ is stored in the bucket`
const TOO_LARGE = `Larger than ${formatBytes(SCRATCH_READ_LIMIT_BYTES)}, so the kernel cannot hand it out`
/** A folder is handled object by object; the bound keeps one action from moving an archive. */
const FOLDER_LIMIT = 500

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

const emit = defineEmits<{ (event: 'start'): void }>()

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
const renaming = ref<string | null>(null)
const renameName = ref('')
const confirming = ref<string | null>(null)
/** A move, rename or delete is running against the bucket. */
const busy = ref(false)

const selected = ref<string | null>(null)
const menu = ref<{ path: string; x: number; y: number } | null>(null)
const rowEls = new Map<string, HTMLElement>()

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
  busy.value = false
  note.value = null
  error.value = null
  target.value = DATA_FOLDER
  dataKeys.value = new Set()
  creating.value = null
  renaming.value = null
  confirming.value = null
  selected.value = null
  menu.value = null
  addOpen.value = false
  importOpen.value = false
  copyOpen.value = false
}, { flush: 'sync' })

defineExpose({ refresh: () => files.refresh() })

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

const menuRow = computed(() => rows.value.find((row) => row.path === menu.value?.path) ?? null)

function indent(depth: number) {
  return { paddingLeft: `${depth * 16}px` }
}

function isOpen(path: string): boolean {
  return files.expanded.value.has(path)
}

function countFiles(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`
}

function validName(name: string): boolean {
  return Boolean(name) && !name.includes('/') && name !== '.' && name !== '..'
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

function bindRow(path: string, el: unknown) {
  if (el) rowEls.set(path, el as HTMLElement)
  else rowEls.delete(path)
}

function select(path: string) {
  selected.value = path
  void nextTick(() => rowEls.get(path)?.focus?.())
}

/** Double click and Enter: a folder opens or closes, a small file downloads. */
function activate(row: TreeRow) {
  if (row.kind === 'dir') files.toggle(row.path)
  else if (row.kind === 'file' && row.bytes < SCRATCH_READ_LIMIT_BYTES) void download(row.path, row.name)
}

function onKey(row: TreeRow, event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  const index = rows.value.indexOf(row)
  const open = row.kind === 'dir' && isOpen(row.path)
  let next: TreeRow | undefined
  switch (event.key) {
    case 'ArrowDown': next = rows.value[index + 1]; break
    case 'ArrowUp': next = rows.value[index - 1]; break
    case 'ArrowRight':
      if (row.kind === 'dir' && !open) files.toggle(row.path)
      else if (open) next = rows.value[index + 1]
      break
    case 'ArrowLeft':
      if (open) files.toggle(row.path)
      else next = rows.value.find((other) => other.path === parentPath(row.path))
      break
    case 'Enter': activate(row); break
    default: return
  }
  event.preventDefault()
  if (next && next.kind !== 'note') select(next.path)
}

/** Opens the row menu at the pointer, or below the three dots when the click had no position. */
async function openMenu(row: TreeRow, event: MouseEvent) {
  selected.value = row.path
  const box = event.clientX || event.clientY ? null : (event.currentTarget as HTMLElement | null)?.getBoundingClientRect?.()
  const x = box ? box.right : event.clientX ?? 0
  const y = box ? box.bottom : event.clientY ?? 0
  if (menu.value) {
    menu.value = null
    await nextTick()
  }
  menu.value = { path: row.path, x, y }
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
  if (folder === null || !validName(name)) return
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

function startRename(row: TreeRow) {
  renaming.value = row.path
  renameName.value = row.name
}

async function commitRename() {
  const row = rows.value.find((other) => other.path === renaming.value)
  const name = renameName.value.trim()
  renaming.value = null
  if (!row || !validName(name) || name === row.name) return
  await relocate(row, joinPath(parentPath(row.path) ?? '', name), `Renamed ${row.name} to ${name}.`)
}

/** The keys below a data/ folder, or null after showing why they cannot be handled. */
async function folderKeys(row: TreeRow, verb: string): Promise<string[] | null> {
  const active = current()
  try {
    const listing = await s3.listObjectsRecursive(bucket.value, `${row.path}/`, FOLDER_LIMIT)
    if (!active()) return null
    if (listing.truncated) {
      error.value = `${row.name}/ holds more than ${FOLDER_LIMIT} files. ${verb} a smaller folder.`
      return null
    }
    return listing.objects.map((object) => object.key)
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
    return null
  }
}

/** Moves a data/ file or folder to `dest`: every key is copied first, then the old keys go. */
async function relocate(source: TreeRow, dest: string, done: string) {
  if (!inData(source.path) || !inData(dest) || dest === source.path || busy.value) return
  const active = current()
  busy.value = true
  error.value = null
  note.value = null
  try {
    const keys = source.kind === 'dir' ? await folderKeys(source, 'Move') : [source.path]
    if (!keys) return
    if (!keys.length) {
      error.value = `${source.name}/ holds no files.`
      return
    }
    for (const key of keys) {
      await s3.copyObject({ bucket: bucket.value, key }, bucket.value, `${dest}${key.slice(source.path.length)}`)
      if (!active()) return
    }
    for (const key of keys) {
      await s3.deleteObject(bucket.value, key)
      if (!active()) return
    }
    if (selected.value === source.path) selected.value = dest
    note.value = done
    files.refresh(parentPath(dest) ?? '')
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
  } finally {
    if (active()) busy.value = false
  }
}

async function remove(row: TreeRow) {
  confirming.value = null
  if (!inData(row.path) || busy.value) return
  const active = current()
  busy.value = true
  error.value = null
  note.value = null
  try {
    if (row.kind === 'dir') {
      if (!(await folderKeys(row, 'Delete'))) return
      const result = await s3.deletePrefix(bucket.value, `${row.path}/`)
      if (!active()) return
      if (result.errors.length) error.value = `${countFiles(result.errors.length)} could not be deleted: ${result.errors[0].message}`
    } else {
      await s3.deleteObject(bucket.value, row.path)
      if (!active()) return
    }
    if (selected.value === row.path) selected.value = null
    files.refresh(parentPath(row.path) ?? '')
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
  } finally {
    if (active()) busy.value = false
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
  error.value = null
  let keys = inData(row.path) ? [row.path] : []
  if (row.kind === 'dir') {
    const listed = await folderKeys(row, 'Copy')
    if (!listed) return
    if (!listed.length) {
      error.value = `${row.name}/ holds no files.`
      return
    }
    keys = listed
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
    <div class="space-y-3 px-3 py-3">
      <Notice v-if="note" tone="info">{{ note }}</Notice>
      <Notice v-if="error" tone="error">{{ error }}</Notice>

      <div v-if="!session.running.value" class="space-y-2">
        <EmptyState compact title="Not running." description="Start a kernel to see the files inside it." />
        <Button size="sm" class="w-full" @click="emit('start')"><Play class="size-3.5" /> Start kernel</Button>
      </div>
      <p v-else-if="root?.starting || (!root?.entries && !root?.error && !session.live.value)" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner /> The kernel is starting.
      </p>
      <p v-else-if="!root?.entries && !root?.error" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner /> Reading the kernel files.
      </p>
      <div v-else role="tree" aria-label="Kernel files" class="min-w-0 space-y-0.5 text-xs">
        <template v-for="(row, index) in rows" :key="row.path">
          <p v-if="row.kind === 'note'" class="truncate px-1 py-0.5 text-destructive" :style="indent(row.depth)">{{ row.name }}</p>
          <div
            v-else
            :ref="(el) => bindRow(row.path, el)"
            role="treeitem"
            :data-path="row.path"
            :tabindex="selected === row.path || (!selected && index === 0) ? 0 : -1"
            :aria-selected="selected === row.path"
            :aria-expanded="row.kind === 'dir' ? isOpen(row.path) : undefined"
            class="grid grid-cols-[1rem_1rem_minmax(0,1fr)_auto_1.25rem] items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            :class="selected === row.path ? 'bg-primary/10' : 'hover:bg-muted/40'"
            :style="indent(row.depth)"
            @click="selected = row.path"
            @dblclick="activate(row)"
            @keydown="onKey(row, $event)"
            @contextmenu.prevent="openMenu(row, $event)"
          >
            <button
              v-if="row.kind === 'dir'"
              type="button"
              tabindex="-1"
              class="rounded p-0.5 text-muted-foreground hover:text-foreground"
              :aria-expanded="isOpen(row.path)"
              :aria-label="`${isOpen(row.path) ? 'Collapse' : 'Expand'} ${row.name}`"
              @click="files.toggle(row.path)"
              @dblclick.stop
            >
              <ChevronRight :class="['h-3 w-3 transition-transform', isOpen(row.path) && 'rotate-90']" />
            </button>
            <span v-else />
            <Folder v-if="row.kind === 'dir'" class="h-3.5 w-3.5 text-primary/70" />
            <FileText v-else class="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              v-if="renaming === row.path"
              v-model="renameName"
              class="h-6 w-full font-mono text-xs"
              aria-label="New name"
              autofocus
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="renaming = null"
              @blur="commitRename"
            />
            <span v-else class="truncate font-mono text-foreground" :title="row.name">{{ row.kind === 'dir' ? `${row.name}/` : row.name }}</span>
            <span class="text-right text-[10px] tabular-nums text-muted-foreground">
              <Spinner v-if="row.kind === 'dir' && files.directory(row.path)?.loading" />
              <template v-else-if="row.kind === 'file'">{{ formatBytes(row.bytes) }}</template>
            </span>
            <Button variant="ghost" size="icon-sm" class="h-5 w-5" tabindex="-1" :title="`Actions for ${row.name}`" :aria-label="`Actions for ${row.name}`" @click="openMenu(row, $event)">
              <EllipsisVertical class="size-3" />
            </Button>
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

          <!-- Inline confirm before a data/ entry is deleted. -->
          <div v-if="confirming === row.path" class="flex flex-wrap items-center gap-1.5 py-0.5" :style="indent(row.depth + 1)">
            <span class="text-muted-foreground">Delete {{ row.kind === 'dir' ? `${row.name}/` : row.name }}?</span>
            <Button size="sm" variant="destructive" class="h-6 px-2" @click="remove(row)">Delete</Button>
            <Button size="sm" variant="ghost" class="h-6 px-2" @click="confirming = null">Cancel</Button>
          </div>
        </template>
        <p v-if="!rows.length" class="py-2 text-muted-foreground">The kernel folder is empty.</p>
      </div>
    </div>

    <!-- One menu for every row, anchored where the pointer or the three dots were. -->
    <DropdownMenu :open="menu !== null" :modal="false" @update:open="(open: boolean) => { if (!open) menu = null }">
      <DropdownMenuTrigger as-child>
        <span aria-hidden="true" class="fixed size-0" :style="{ left: `${menu?.x ?? 0}px`, top: `${menu?.y ?? 0}px` }" />
      </DropdownMenuTrigger>
      <DropdownMenuContent v-if="menuRow" align="start" class="min-w-[12rem]" @close-auto-focus="(e: Event) => e.preventDefault()">
        <template v-if="menuRow.kind === 'dir'">
          <DropdownMenuItem class="text-xs" :disabled="!inData(menuRow.path)" :title="inData(menuRow.path) ? undefined : OUTSIDE_DATA" @select="startFolder(menuRow.path)">
            <FolderPlus class="size-3.5 text-muted-foreground" /> New folder
          </DropdownMenuItem>
          <DropdownMenuItem class="text-xs" :disabled="Boolean(stageReason(menuRow.path)) || staging" :title="stageReason(menuRow.path) ?? undefined" @select="openAdd(menuRow.path)">
            <Plus class="size-3.5 text-muted-foreground" /> Add files from buckets
          </DropdownMenuItem>
          <DropdownMenuItem class="text-xs" :disabled="!inData(menuRow.path)" :title="inData(menuRow.path) ? undefined : OUTSIDE_DATA" @select="openImport(menuRow.path)">
            <CloudDownload class="size-3.5 text-muted-foreground" /> Import from connector
          </DropdownMenuItem>
        </template>
        <DropdownMenuItem v-else class="text-xs" :disabled="menuRow.bytes >= SCRATCH_READ_LIMIT_BYTES" :title="menuRow.bytes >= SCRATCH_READ_LIMIT_BYTES ? TOO_LARGE : undefined" @select="download(menuRow.path, menuRow.name)">
          <Download class="size-3.5 text-muted-foreground" /> Download
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs" :disabled="Boolean(copyReason(menuRow)) || copyBusy" :title="copyReason(menuRow) ?? undefined" @select="startCopy(menuRow)">
          <Copy class="size-3.5 text-muted-foreground" /> Copy to bucket
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs" :disabled="!inData(menuRow.path) || busy" :title="inData(menuRow.path) ? undefined : OUTSIDE_DATA" @select="startRename(menuRow)">
          <Pencil class="size-3.5 text-muted-foreground" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs" :disabled="!inData(menuRow.path) || busy" :title="inData(menuRow.path) ? undefined : OUTSIDE_DATA" @select="confirming = menuRow.path">
          <Trash2 class="size-3.5 text-muted-foreground" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

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
