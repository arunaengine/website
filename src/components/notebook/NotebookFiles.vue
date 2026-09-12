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
import IconButton from '@/components/ui/IconButton.vue'
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
  PanelLeft,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from '@lucide/vue'

/** The kernel folder the bucket is mounted under; only it can be written from here. */
const DATA_FOLDER = NOTEBOOK_DATA_PREFIX.replace(/\/$/, '')
const OUTSIDE_DATA = `Only ${DATA_FOLDER}/ is stored in the bucket`
const ONE_TO_RENAME = 'Select one item to rename'
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

const emit = defineEmits<{ (event: 'start'): void; (event: 'hide'): void }>()

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
/** The rows one inline confirm would delete, shown under the row it was asked on. */
const confirming = ref<{ at: string; paths: string[] } | null>(null)
/** A move, rename, delete or upload is running against the bucket. */
const busy = ref(false)

const selection = ref<ReadonlySet<string>>(new Set())
/** Where a shift range starts, and the row that carries the focus. */
const anchor = ref<string | null>(null)
const focused = ref<string | null>(null)
const menu = ref<{ path: string; x: number; y: number } | null>(null)
const dragging = ref<string[]>([])
const dropTarget = ref<string | null>(null)
const rowEls = new Map<string, HTMLElement>()

const copyOpen = ref(false)
const copySources = ref<CopySource[]>([])
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
  selection.value = new Set()
  anchor.value = null
  focused.value = null
  menu.value = null
  dragging.value = []
  copySources.value = []
  dropTarget.value = null
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
const menuRows = computed(() => (menuRow.value ? targets(menuRow.value) : []))
const menuCount = computed(() => menuRows.value.length)
/** The row that takes the tab stop: the focused one, or the first when it is gone. */
const focusRow = computed(() => rows.value.find((row) => row.path === focused.value)?.path ?? rows.value.find((row) => row.kind !== 'note')?.path)
const copyLabel = computed(() => (copySources.value.length > 1 ? `${copySources.value.length} items` : copySources.value[0]?.name ?? ''))
const treeReady = computed(() => session.running.value && !root.value?.starting && Boolean(root.value?.entries || root.value?.error))

/** The breadcrumb folder: the focused folder, the parent of the focused file, or the root. */
const crumbFolder = computed(() => {
  const row = rows.value.find((other) => other.path === focused.value)
  if (!row) return ''
  return row.kind === 'dir' ? row.path : parentPath(row.path) ?? ''
})
const crumbs = computed(() => {
  const names = crumbFolder.value ? crumbFolder.value.split('/') : []
  return [{ path: '', name: 'work' }, ...names.map((name, index) => ({ path: names.slice(0, index + 1).join('/'), name }))]
})
/** A long path keeps its first and last segment; the ones between hide behind an ellipsis. */
const shownCrumbs = computed(() => (crumbs.value.length > 3 ? [crumbs.value[0], null, crumbs.value[crumbs.value.length - 1]] : crumbs.value))
const hiddenCrumbs = computed(() => crumbs.value.slice(1, -1).map((crumb) => crumb.name).join('/'))
const copyCount = computed(() => copySources.value.reduce((sum, source) => sum + (source.keys.length || 1), 0))

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

function isSelected(path: string): boolean {
  return selection.value.has(path)
}

function selectOnly(path: string) {
  selection.value = new Set([path])
  anchor.value = path
  focused.value = path
}

function toggleSelected(path: string) {
  const next = new Set(selection.value)
  if (!next.delete(path)) next.add(path)
  selection.value = next
  anchor.value = path
  focused.value = path
}

/** Selects the shown rows between the anchor and `path`; the anchor stays put. */
function selectRange(path: string) {
  const paths = rows.value.filter((row) => row.kind !== 'note').map((row) => row.path)
  const from = paths.indexOf(anchor.value ?? path)
  const to = paths.indexOf(path)
  if (from < 0 || to < 0) return selectOnly(path)
  selection.value = new Set(paths.slice(Math.min(from, to), Math.max(from, to) + 1))
  if (anchor.value === null) anchor.value = path
  focused.value = path
}

function onClick(row: TreeRow, event: MouseEvent) {
  if (event.shiftKey) selectRange(row.path)
  else if (event.ctrlKey || event.metaKey) toggleSelected(row.path)
  else selectOnly(row.path)
}

function select(path: string) {
  selectOnly(path)
  void nextTick(() => rowEls.get(path)?.focus?.())
}

/** Selects a breadcrumb folder, opens it and brings its row into view; the root clears the selection. */
function goCrumb(path: string) {
  if (!path) {
    selection.value = new Set()
    anchor.value = null
    focused.value = null
    return
  }
  if (!isOpen(path)) files.toggle(path)
  selectOnly(path)
  void nextTick(() => {
    const el = rowEls.get(path)
    el?.scrollIntoView?.({ block: 'nearest' })
    el?.focus?.()
  })
}

/** The rows an action on `row` covers: the whole selection when it is part of one. */
function targets(row: TreeRow): TreeRow[] {
  if (!isSelected(row.path) || selection.value.size < 2) return [row]
  const covered = (path: string) => {
    for (let parent = parentPath(path); parent; parent = parentPath(parent)) if (isSelected(parent)) return true
    return false
  }
  return rows.value.filter((other) => other.kind !== 'note' && isSelected(other.path) && !covered(other.path))
}

function deleteReason(list: TreeRow[]): string | null {
  return list.every((row) => inData(row.path)) ? null : OUTSIDE_DATA
}

function askDelete(row: TreeRow) {
  const list = targets(row)
  if (deleteReason(list) || busy.value) return
  confirming.value = { at: row.path, paths: list.map((other) => other.path) }
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
    case 'Escape': selectOnly(row.path); break
    case 'Delete': askDelete(row); break
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
  if (!next || next.kind === 'note') return
  if (event.shiftKey) {
    selectRange(next.path)
    void nextTick(() => rowEls.get(next.path)?.focus?.())
  } else select(next.path)
}

/** Opens the row menu at the pointer, or below the three dots when the click had no position. */
async function openMenu(row: TreeRow, event: MouseEvent) {
  if (!isSelected(row.path)) selectOnly(row.path)
  const box = event.clientX || event.clientY ? null : (event.currentTarget as HTMLElement | null)?.getBoundingClientRect?.()
  const x = box ? box.right : event.clientX ?? 0
  const y = box ? box.bottom : event.clientY ?? 0
  if (menu.value) {
    menu.value = null
    await nextTick()
  }
  menu.value = { path: row.path, x, y }
}

/** Dragging a selected data/ row takes every selected data/ row along. */
function startDrag(row: TreeRow, event: DragEvent) {
  if (!inData(row.path) || row.kind === 'note') return
  if (!isSelected(row.path)) selectOnly(row.path)
  const list = targets(row).filter((other) => inData(other.path))
  dragging.value = list.map((other) => other.path)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', dragging.value.join('\n'))
    setDragImage(event.dataTransfer, list.length > 1 ? `${list.length} items` : row.kind === 'dir' ? `${row.name}/` : row.name)
  }
}

// The browser would drag the whole highlighted row; a small name chip travels instead.
function setDragImage(transfer: DataTransfer, label: string) {
  const doc = globalThis.document
  if (!doc?.body || typeof transfer.setDragImage !== 'function') return
  const chip = doc.createElement('div')
  chip.textContent = label
  chip.className = 'pointer-events-none fixed left-0 top-0 rounded-md border border-border bg-popover px-2 py-1 text-xs text-foreground shadow-md'
  chip.style.transform = 'translate(-9999px, -9999px)'
  doc.body.appendChild(chip)
  transfer.setDragImage(chip, 12, 12)
  setTimeout(() => chip.remove(), 0)
}

function endDrag() {
  dragging.value = []
  dropTarget.value = null
}

/** What a drop on this row would do; only a data/ folder takes anything. */
function dropKind(row: TreeRow, event: DragEvent): 'files' | 'move' | null {
  if (row.kind !== 'dir' || !inData(row.path) || !bucket.value || busy.value) return null
  if (event.dataTransfer?.types.includes('Files')) return 'files'
  const from = dragging.value
  if (!from.length) return null
  if (from.some((path) => path === row.path || row.path.startsWith(`${path}/`) || parentPath(path) === row.path)) return null
  return 'move'
}

function dragOver(row: TreeRow, event: DragEvent) {
  const kind = dropKind(row, event)
  if (!kind) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    if (dropTarget.value === row.path) dropTarget.value = null
    return
  }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = kind === 'files' ? 'copy' : 'move'
  dropTarget.value = row.path
}

function dragLeave(row: TreeRow) {
  if (dropTarget.value === row.path) dropTarget.value = null
}

async function dropOn(row: TreeRow, event: DragEvent) {
  const kind = dropKind(row, event)
  const sources = rows.value.filter((other) => dragging.value.includes(other.path))
  endDrag()
  if (kind === 'files') await upload(row.path, Array.from(event.dataTransfer?.files ?? []))
  else if (kind === 'move' && sources.length) await moveAll(sources, row.path)
}

/** Moves the dragged rows one after the other and stops at the first failure. */
async function moveAll(list: TreeRow[], folder: string) {
  const active = current()
  let moved = 0
  for (const source of list) {
    if (!(await relocate(source, joinPath(folder, source.name), `Moved ${source.name} to ${folder}/.`))) break
    moved += 1
  }
  if (!active() || list.length < 2 || !moved) return
  note.value = moved === list.length ? `Moved ${moved} items to ${folder}/.` : `Moved ${moved} of ${list.length} items to ${folder}/.`
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
async function relocate(source: TreeRow, dest: string, done: string): Promise<boolean> {
  if (!inData(source.path) || !inData(dest) || dest === source.path || busy.value) return false
  const active = current()
  busy.value = true
  error.value = null
  note.value = null
  try {
    const keys = source.kind === 'dir' ? await folderKeys(source, 'Move') : [source.path]
    if (!keys) return false
    if (!keys.length) {
      error.value = `${source.name}/ holds no files.`
      return false
    }
    for (const key of keys) {
      await s3.copyObject({ bucket: bucket.value, key }, bucket.value, `${dest}${key.slice(source.path.length)}`)
      if (!active()) return false
    }
    for (const key of keys) {
      await s3.deleteObject(bucket.value, key)
      if (!active()) return false
    }
    if (isSelected(source.path)) selection.value = new Set([...selection.value].map((path) => (path === source.path ? dest : path)))
    if (focused.value === source.path) focused.value = dest
    note.value = done
    files.refresh(parentPath(dest) ?? '')
    return true
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
    return false
  } finally {
    if (active()) busy.value = false
  }
}

/** Deletes the confirmed rows one after the other; the folders touched so far are read again. */
async function remove(list: TreeRow[]) {
  confirming.value = null
  if (!list.length || deleteReason(list) || busy.value) return
  const active = current()
  busy.value = true
  error.value = null
  note.value = null
  const gone: string[] = []
  try {
    for (const row of list) {
      if (row.kind === 'dir') {
        if (!(await folderKeys(row, 'Delete'))) return
        const result = await s3.deletePrefix(bucket.value, `${row.path}/`)
        if (!active()) return
        if (result.errors.length) error.value = `${countFiles(result.errors.length)} could not be deleted: ${result.errors[0].message}`
      } else {
        await s3.deleteObject(bucket.value, row.path)
        if (!active()) return
      }
      gone.push(row.path)
    }
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
  } finally {
    if (active()) {
      busy.value = false
      selection.value = new Set([...selection.value].filter((path) => !gone.includes(path)))
      for (const folder of new Set(gone.map((path) => parentPath(path) ?? ''))) files.refresh(folder)
    }
  }
}

/** Uploads dropped operating system files into a data/ folder, one after the other. */
async function upload(folder: string, list: File[]) {
  if (!list.length || busy.value) return
  const active = current()
  busy.value = true
  error.value = null
  let done = 0
  try {
    for (const file of list) {
      note.value = `Uploading ${done + 1} of ${countFiles(list.length)} to ${folder}/…`
      await s3.uploadObject(bucket.value, joinPath(folder, file.name), file).promise
      if (!active()) return
      done += 1
    }
    note.value = `Uploaded ${countFiles(done)} to ${folder}/.`
  } catch (cause) {
    if (!active()) return
    note.value = done ? `Uploaded ${done} of ${countFiles(list.length)} to ${folder}/.` : null
    error.value = errorMessage(cause)
  } finally {
    if (active()) {
      busy.value = false
      if (done) files.refresh(folder)
    }
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

function copyReasonAll(list: TreeRow[]): string | null {
  for (const row of list) {
    const reason = copyReason(row)
    if (reason) return reason
  }
  return null
}

/** Opens the destination picker; a folder is listed first so the count is known. */
async function startCopy(list: TreeRow[]) {
  if (!list.length || list.some((row) => row.kind === 'note') || copyReasonAll(list)) return
  error.value = null
  const sources: CopySource[] = []
  for (const row of list) {
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
    sources.push({ path: row.path, name: row.name, kind: row.kind as ScratchEntry['kind'], keys })
  }
  copySources.value = sources
  copyOpen.value = true
}

async function copyOne(source: CopySource, destination: { bucket: string; prefix: string }, active: () => boolean) {
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
}

async function copyTo(destination: { bucket: string; prefix: string }) {
  const sources = copySources.value
  const [source] = sources
  if (!source || copyBusy.value) return
  const active = current()
  copyBusy.value = true
  error.value = null
  note.value = null
  const where = `${destination.bucket}/${destination.prefix}`
  try {
    for (const each of sources) {
      await copyOne(each, destination, active)
      if (!active()) return
    }
    copyOpen.value = false
    if (sources.length > 1) note.value = `Copied ${sources.length} items to ${where}.`
    else if (source.kind === 'dir') note.value = `Copied ${source.keys.length} files from ${source.name}/ to ${where}${source.name}/.`
    else note.value = `Copied ${source.name} to ${where}.`
  } catch (cause) {
    if (active()) error.value = errorMessage(cause)
  } finally {
    if (active()) copyBusy.value = false
  }
}
</script>

<template>
  <aside class="surface min-w-0 overflow-hidden">
    <header class="sticky top-0 z-[1] flex h-12 items-center gap-1 border-b border-border/60 bg-card px-3">
      <h2 class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Files</h2>
      <IconButton v-if="session.running.value" label="Refresh kernel files" class="h-8 w-8 shrink-0" @click="files.refresh()"><RefreshCw class="size-4" /></IconButton>
      <IconButton label="Hide files" aria-expanded="true" class="h-8 w-8 shrink-0" @click="emit('hide')"><PanelLeft class="size-4" /></IconButton>
    </header>
    <div class="space-y-3 px-3 py-3">
      <nav v-if="treeReady" aria-label="Current folder" class="flex items-center overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground">
        <template v-for="(crumb, index) in shownCrumbs" :key="crumb?.path ?? '…'">
          <ChevronRight v-if="index" class="h-3 w-3 shrink-0" />
          <span v-if="!crumb" :title="hiddenCrumbs">…</span>
          <button
            v-else
            type="button"
            class="truncate rounded px-0.5 hover:text-foreground"
            :aria-current="crumb.path === crumbFolder ? 'location' : undefined"
            @click="goCrumb(crumb.path)"
          >{{ crumb.name }}</button>
        </template>
      </nav>
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
      <div v-else role="tree" aria-label="Kernel files" aria-multiselectable="true" class="min-w-0 space-y-0.5 text-xs">
        <template v-for="row in rows" :key="row.path">
          <p v-if="row.kind === 'note'" class="truncate px-1 py-0.5 text-destructive" :style="indent(row.depth)">{{ row.name }}</p>
          <div
            v-else
            :ref="(el) => bindRow(row.path, el)"
            role="treeitem"
            :data-path="row.path"
            :tabindex="focusRow === row.path ? 0 : -1"
            :aria-selected="isSelected(row.path)"
            :aria-expanded="row.kind === 'dir' ? isOpen(row.path) : undefined"
            :draggable="inData(row.path)"
            class="grid grid-cols-[1rem_1rem_minmax(0,1fr)_auto_1.25rem] items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            :class="[
              isSelected(row.path) ? 'bg-primary/10' : 'hover:bg-muted/40',
              dropTarget === row.path && 'bg-primary/5 ring-1 ring-inset ring-primary',
            ]"
            :style="indent(row.depth)"
            @click="onClick(row, $event)"
            @dblclick="activate(row)"
            @keydown="onKey(row, $event)"
            @contextmenu.prevent="openMenu(row, $event)"
            @dragstart="startDrag(row, $event)"
            @dragend="endDrag"
            @dragover="dragOver(row, $event)"
            @dragleave="dragLeave(row)"
            @drop.prevent="dropOn(row, $event)"
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

          <!-- Inline confirm before data/ entries are deleted. -->
          <div v-if="confirming?.at === row.path" class="flex flex-wrap items-center gap-1.5 py-0.5" :style="indent(row.depth + 1)">
            <span class="text-muted-foreground">
              Delete {{ confirming.paths.length > 1 ? `${confirming.paths.length} items` : row.kind === 'dir' ? `${row.name}/` : row.name }}?
            </span>
            <Button size="sm" variant="destructive" class="h-6 px-2" @click="remove(rows.filter((other) => confirming?.paths.includes(other.path)))">Delete</Button>
            <Button size="sm" variant="ghost" class="h-6 px-2" @click="confirming = null">Cancel</Button>
            <p v-if="confirming.paths.length > 1" class="w-full truncate font-mono text-muted-foreground" :title="confirming.paths.join('\n')">{{ confirming.paths.join(', ') }}</p>
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
        <DropdownMenuItem class="text-xs" :disabled="Boolean(copyReasonAll(menuRows)) || copyBusy" :title="copyReasonAll(menuRows) ?? undefined" @select="startCopy(menuRows)">
          <Copy class="size-3.5 text-muted-foreground" /> {{ menuCount > 1 ? `Copy ${menuCount} items to bucket` : 'Copy to bucket' }}
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs" :disabled="menuCount > 1 || !inData(menuRow.path) || busy" :title="menuCount > 1 ? ONE_TO_RENAME : inData(menuRow.path) ? undefined : OUTSIDE_DATA" @select="startRename(menuRow)">
          <Pencil class="size-3.5 text-muted-foreground" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs" :disabled="Boolean(deleteReason(menuRows)) || busy" :title="deleteReason(menuRows) ?? undefined" @select="askDelete(menuRow)">
          <Trash2 class="size-3.5 text-muted-foreground" /> {{ menuCount > 1 ? `Delete ${menuCount} items` : 'Delete' }}
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
      :source="copyLabel"
      :count="copyCount || 1"
      :group-id="notebook.meta.value?.group_id ?? null"
      :busy="copyBusy"
      @copy="copyTo"
    />
  </aside>
</template>
