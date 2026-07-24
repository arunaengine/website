<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import { validContainerDir, validContainerFilePath, type TesDataRefEntry } from '@/lib/tes'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  EllipsisVertical,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  X,
} from '@lucide/vue'

// Live preview of the container filesystem derived from the run's form state
// (script, inputs, output captures, workspace mount). All edits write back
// through events; the component owns nothing but scaffolding folders and view
// state. Follows DataPathTree's tree idiom but renders a flattened row list,
// the whole tree is small and expanded by default.

export interface FsOutputEntry {
  containerPath: string
  /** Display-only destination (s3://bucket/key); edited via the details slot. */
  destination: string
}

const props = defineProps<{
  inputs: TesDataRefEntry[]
  outputs: FsOutputEntry[]
  script?: { path: string; label?: string } | null
  workspace?: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update-input-path', index: number, path: string): void
  (e: 'remove-input', index: number): void
  (e: 'update-output-path', index: number, path: string): void
  (e: 'remove-output', index: number): void
  (e: 'add-output', containerDir: string): void
  (e: 'add-input', containerDir: string): void
}>()

type MarkerKind = 'script' | 'in' | 'out' | 'ws'
interface Marker {
  kind: MarkerKind
  dir: boolean
  index?: number
  secondary?: string
  files?: string[]
  /** The raw editable value backing this marker (trailing slash preserved). */
  raw: string
}
interface Row {
  path: string
  name: string
  depth: number
  isDir: boolean
  markers: Marker[]
  extra: boolean
  hasChildren: boolean
}

function normPath(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '/') return '/'
  return trimmed.replace(/\/+$/, '')
}
function parentOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}
function baseName(path: string): string {
  return path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1)
}
function ensureDir(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

// Scaffolding folders created in the tree; they become real state only once an
// input or output lands inside them.
const extraDirs = ref<Set<string>>(new Set())
const collapsed = ref<Set<string>>(new Set())

const model = computed(() => {
  const markersByPath = new Map<string, Marker[]>()
  const dirPaths = new Set<string>(['/'])
  const filePaths = new Set<string>()
  const unplaced: Marker[] = []

  const ensureAncestors = (path: string) => {
    let dir = parentOf(path)
    while (!dirPaths.has(dir)) {
      dirPaths.add(dir)
      if (dir === '/') break
      dir = parentOf(dir)
    }
  }
  const place = (raw: string, marker: Marker) => {
    const valid = marker.dir ? raw.trim() !== '' && validContainerDir(raw) : validContainerFilePath(raw.trim())
    if (!valid) {
      unplaced.push(marker)
      return
    }
    const path = normPath(raw)
    if (marker.dir) dirPaths.add(path)
    else filePaths.add(path)
    ensureAncestors(path)
    const list = markersByPath.get(path)
    if (list) list.push(marker)
    else markersByPath.set(path, [marker])
  }

  if (props.workspace) {
    place(props.workspace, { kind: 'ws', dir: true, raw: props.workspace, secondary: 'working directory' })
  }
  if (props.script) {
    place(props.script.path, { kind: 'script', dir: false, raw: props.script.path, secondary: props.script.label })
  }
  props.inputs.forEach((entry, index) => {
    if (entry.kind === 'folder') {
      place(entry.basePath, {
        kind: 'in',
        dir: true,
        index,
        raw: entry.basePath,
        secondary: `s3://${entry.bucket}/${entry.prefix}`,
        files: entry.files.map((file) => file.name),
      })
    } else {
      place(entry.path, { kind: 'in', dir: false, index, raw: entry.path, secondary: entry.url })
    }
  })
  props.outputs.forEach((entry, index) => {
    const dir = entry.containerPath.trim().endsWith('/')
    place(entry.containerPath, { kind: 'out', dir, index, raw: entry.containerPath, secondary: entry.destination })
  })
  for (const dir of extraDirs.value) {
    dirPaths.add(dir)
    ensureAncestors(dir)
  }

  const childrenOf = new Map<string, string[]>()
  for (const path of new Set([...dirPaths, ...filePaths])) {
    if (path === '/') continue
    const parent = parentOf(path)
    const list = childrenOf.get(parent)
    if (list) list.push(path)
    else childrenOf.set(parent, [path])
  }

  const rows: Row[] = []
  const visit = (path: string, depth: number) => {
    const children = childrenOf.get(path) ?? []
    rows.push({
      path,
      name: baseName(path),
      depth,
      isDir: dirPaths.has(path),
      markers: markersByPath.get(path) ?? [],
      extra: extraDirs.value.has(path),
      hasChildren: children.length > 0,
    })
    if (collapsed.value.has(path)) return
    children.sort((a, b) => {
      const aDir = dirPaths.has(a)
      const bDir = dirPaths.has(b)
      if (aDir !== bDir) return aDir ? -1 : 1
      return a.localeCompare(b)
    })
    for (const child of children) visit(child, depth + 1)
  }
  visit('/', 0)
  return { rows, unplaced }
})

function toggleCollapse(path: string) {
  const next = new Set(collapsed.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsed.value = next
}

// Folder-input contents are display-only; the cap keeps huge folders sane.
const FOLDER_FILE_PREVIEW = 8
function folderFilesFor(row: Row): string[] {
  if (collapsed.value.has(row.path)) return []
  return row.markers.find((marker) => marker.kind === 'in' && marker.dir)?.files ?? []
}

// ── Inline editing (rename doubles as move: the full path is edited) ─────────
const editing = ref<{ path: string; marker: Marker | null; value: string } | null>(null)

function markerFor(row: Row): Marker | null {
  return row.markers.find((marker) => marker.index !== undefined) ?? null
}
// The script path and the workspace mount are owned by the host form; a folder
// above the script must not be renamed either, the executor command points at
// the fixed script path.
function canRename(row: Row): boolean {
  if (props.disabled || row.path === '/') return false
  if (row.markers.some((marker) => marker.kind === 'script' || marker.kind === 'ws')) return false
  if (props.script && validContainerFilePath(props.script.path.trim())) {
    const scriptPath = normPath(props.script.path)
    if (scriptPath === row.path || scriptPath.startsWith(`${row.path}/`)) return false
  }
  return true
}

function startEdit(row: Row) {
  if (!canRename(row)) return
  const marker = markerFor(row)
  editing.value = { path: row.path, marker, value: marker?.raw ?? row.path }
}
function startEditMarker(marker: Marker) {
  if (props.disabled) return
  editing.value = { path: '', marker, value: marker.raw }
}

function applyMarkerPath(marker: Marker, value: string) {
  if (marker.index === undefined) return
  const next = marker.dir ? ensureDir(value) : value
  if (marker.kind === 'in') emit('update-input-path', marker.index, next)
  else if (marker.kind === 'out') emit('update-output-path', marker.index, next)
}

function mapRawPath(raw: string, oldPath: string, newPath: string): string | null {
  const isDirRaw = raw.trim().endsWith('/')
  const norm = normPath(raw)
  if (norm === oldPath) return isDirRaw ? `${newPath}/` : newPath
  if (norm.startsWith(`${oldPath}/`)) {
    const mapped = `${newPath}/${norm.slice(oldPath.length + 1)}`
    return isDirRaw ? `${mapped}/` : mapped
  }
  return null
}

// Renaming a structural folder moves everything underneath it: every affected
// input and output row path is rewritten, scaffolding folders follow along.
function renameSubtree(oldPath: string, newRaw: string) {
  const candidate = newRaw.trim()
  const newPath = normPath(candidate.startsWith('/') ? candidate : `/${candidate}`)
  if (newPath === '/' || !validContainerDir(newPath) || newPath === oldPath) return
  props.inputs.forEach((entry, index) => {
    const raw = entry.kind === 'folder' ? entry.basePath : entry.path
    const mapped = mapRawPath(raw, oldPath, newPath)
    if (mapped !== null) emit('update-input-path', index, mapped)
  })
  props.outputs.forEach((entry, index) => {
    const mapped = mapRawPath(entry.containerPath, oldPath, newPath)
    if (mapped !== null) emit('update-output-path', index, mapped)
  })
  const nextExtra = new Set<string>()
  for (const dir of extraDirs.value) {
    const mapped = mapRawPath(dir, oldPath, newPath)
    nextExtra.add(mapped ? normPath(mapped) : dir)
  }
  extraDirs.value = nextExtra
}

function commitEdit() {
  const edit = editing.value
  if (!edit) return
  editing.value = null
  const value = edit.value.trim()
  if (!value || value === (edit.marker?.raw ?? edit.path)) return
  if (edit.marker) applyMarkerPath(edit.marker, value)
  else renameSubtree(edit.path, value)
}
function cancelEdit() {
  editing.value = null
}

// ── Delete ───────────────────────────────────────────────────────────────────
function removeMarker(marker: Marker) {
  if (marker.index === undefined) return
  if (marker.kind === 'in') emit('remove-input', marker.index)
  else if (marker.kind === 'out') emit('remove-output', marker.index)
}
function removeExtraDir(path: string) {
  const next = new Set(extraDirs.value)
  next.delete(path)
  extraDirs.value = next
}

// ── New folder ───────────────────────────────────────────────────────────────
const creatingIn = ref<string | null>(null)
const newFolderName = ref('')
function startNewFolder(dir: string) {
  creatingIn.value = dir
  newFolderName.value = ''
  const next = new Set(collapsed.value)
  next.delete(dir)
  collapsed.value = next
}
function commitNewFolder() {
  const dir = creatingIn.value
  const name = newFolderName.value.trim()
  creatingIn.value = null
  if (!dir || !name || name.includes('/') || name === '.' || name === '..') return
  extraDirs.value = new Set([...extraDirs.value, `${dir === '/' ? '' : dir}/${name}`])
}

function dirValueOf(row: Row): string {
  return row.path === '/' ? '/' : `${row.path}/`
}

// ── Output destination details (rendered by the host through the slot) ──────
// Always inline below the captured row, mirroring the Table view.
function outIndicesFor(row: Row): number[] {
  return row.markers
    .filter((marker) => marker.kind === 'out' && marker.index !== undefined)
    .map((marker) => marker.index!)
}

// ── Row menus ────────────────────────────────────────────────────────────────
// At most two visible controls per row: a "+" menu on folders (new folder /
// add input / capture output) and a kebab menu for row-specific actions.
function indexMarkersOf(row: Row): Marker[] {
  return row.markers.filter((marker) => marker.index !== undefined)
}
function isRemovableExtraDir(row: Row): boolean {
  return row.extra && !row.hasChildren && !row.markers.length
}
function hasRowMenu(row: Row): boolean {
  return canRename(row) || indexMarkersOf(row).length > 0 || isRemovableExtraDir(row)
}
function secondaryOf(row: Row): Marker | null {
  return row.markers.find((marker) => marker.secondary) ?? null
}

function indent(depth: number) {
  return { paddingLeft: `${depth * 16}px` }
}

const MARKER_LABEL: Record<MarkerKind, string> = { script: 'script', in: 'in', out: 'out', ws: 'workdir' }
const MARKER_VARIANT: Record<MarkerKind, 'secondary' | 'sky' | 'warn' | 'outline'> = {
  script: 'secondary',
  in: 'sky',
  out: 'warn',
  ws: 'outline',
}
</script>

<template>
  <div class="space-y-1 text-xs">
    <template v-for="row in model.rows" :key="row.path">
      <div class="group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/40" :style="indent(row.depth)">
        <button
          v-if="row.isDir && row.hasChildren"
          type="button"
          class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          :aria-expanded="!collapsed.has(row.path)"
          :aria-label="`${collapsed.has(row.path) ? 'Expand' : 'Collapse'} ${row.name}`"
          @click="toggleCollapse(row.path)"
        >
          <ChevronRight :class="['h-3 w-3 transition-transform', !collapsed.has(row.path) && 'rotate-90']" />
        </button>
        <span v-else class="w-4 shrink-0" />

        <component
          :is="row.markers.some((m) => m.kind === 'script') ? FileCode2 : row.isDir ? Folder : FileText"
          class="h-3.5 w-3.5 shrink-0"
          :class="row.isDir ? 'text-primary/70' : 'text-muted-foreground'"
        />

        <template v-if="editing && !editing.marker && editing.path === row.path">
          <Input
            v-model="editing.value"
            class="h-6 min-w-0 flex-1 font-mono text-xs"
            aria-label="Path"
            autofocus
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="cancelEdit"
            @blur="commitEdit"
          />
        </template>
        <template v-else-if="editing && editing.marker && markerFor(row) === editing.marker">
          <Input
            v-model="editing.value"
            class="h-6 min-w-0 flex-1 font-mono text-xs"
            aria-label="Path"
            autofocus
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="cancelEdit"
            @blur="commitEdit"
          />
        </template>
        <template v-else>
          <span class="truncate font-mono text-foreground">{{ row.name }}{{ row.isDir && row.path !== '/' ? '/' : '' }}</span>
          <Badge
            v-for="(marker, i) in row.markers"
            :key="i"
            :variant="MARKER_VARIANT[marker.kind]"
            class="shrink-0 gap-0.5 px-1.5 text-[9px] uppercase"
          >
            <ArrowDownToLine v-if="marker.kind === 'in'" class="h-2.5 w-2.5" />
            <ArrowUpFromLine v-else-if="marker.kind === 'out'" class="h-2.5 w-2.5" />
            {{ MARKER_LABEL[marker.kind] }}<template v-if="marker.files"> · {{ marker.files.length }}</template>
          </Badge>
          <span
            v-for="marker in [secondaryOf(row)].filter((m): m is Marker => m !== null)"
            :key="marker.kind"
            class="hidden min-w-0 flex-1 truncate text-[10px] text-muted-foreground sm:inline"
            :class="marker.kind === 'ws' ? 'italic' : 'font-mono'"
            :title="marker.secondary"
          >
            {{ marker.secondary }}
          </span>

          <span class="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
            <template v-if="!disabled">
              <DropdownMenu v-if="row.isDir">
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-sm" class="h-5 w-5" :title="`Add to ${row.name}`" :aria-label="`Add to ${row.name}`">
                    <Plus class="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="min-w-[11rem]" @close-auto-focus="(e: Event) => e.preventDefault()">
                  <DropdownMenuItem class="text-xs" @select="startNewFolder(row.path)">
                    <FolderPlus class="size-3.5 text-muted-foreground" /> New folder
                  </DropdownMenuItem>
                  <DropdownMenuItem class="text-xs" @select="emit('add-input', dirValueOf(row))">
                    <ArrowDownToLine class="size-3.5 text-muted-foreground" /> Add input here
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    v-if="row.path !== '/' && !row.markers.some((m) => m.kind === 'out' && m.dir)"
                    class="text-xs"
                    @select="emit('add-output', dirValueOf(row))"
                  >
                    <ArrowUpFromLine class="size-3.5 text-muted-foreground" /> Capture as output
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu v-if="hasRowMenu(row)">
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-sm" class="h-5 w-5" :title="`Actions for ${row.name}`" :aria-label="`Actions for ${row.name}`">
                    <EllipsisVertical class="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="min-w-[11rem]" @close-auto-focus="(e: Event) => e.preventDefault()">
                  <DropdownMenuItem v-if="canRename(row)" class="text-xs" @select="startEdit(row)">
                    <Pencil class="size-3.5 text-muted-foreground" /> {{ markerFor(row) ? 'Edit path' : 'Rename or move' }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    v-for="(marker, i) in indexMarkersOf(row)"
                    :key="`rm${i}`"
                    class="text-xs text-destructive focus:text-destructive"
                    @select="removeMarker(marker)"
                  >
                    <X class="size-3.5" /> {{ marker.kind === 'out' ? 'Remove output capture' : 'Remove input' }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    v-if="isRemovableExtraDir(row)"
                    class="text-xs text-destructive focus:text-destructive"
                    @select="removeExtraDir(row.path)"
                  >
                    <X class="size-3.5" /> Remove folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </template>
          </span>
        </template>
      </div>

      <!-- Host-rendered destination editors, inline below every capture. -->
      <div v-for="index in outIndicesFor(row)" :key="`out-${index}`" class="py-1 pr-1" :style="indent(row.depth + 1)">
        <slot name="output-details" :index="index" />
      </div>

      <!-- New-folder input row. -->
      <div v-if="creatingIn === row.path" class="flex items-center gap-1.5 py-0.5" :style="indent(row.depth + 1)">
        <Folder class="h-3.5 w-3.5 shrink-0 text-primary/70" />
        <Input
          v-model="newFolderName"
          class="h-6 w-44 font-mono text-xs"
          placeholder="folder-name"
          aria-label="New folder name"
          autofocus
          @keydown.enter.prevent="commitNewFolder"
          @keydown.esc.prevent="creatingIn = null"
          @blur="commitNewFolder"
        />
      </div>

      <!-- Static contents of a folder input (display only). -->
      <template v-if="folderFilesFor(row).length">
        <div
          v-for="file in folderFilesFor(row).slice(0, FOLDER_FILE_PREVIEW)"
          :key="`${row.path}#${file}`"
          class="flex items-center gap-1 py-0.5 text-muted-foreground"
          :style="indent(row.depth + 1)"
        >
          <span class="w-4 shrink-0" />
          <FileText class="h-3 w-3 shrink-0" />
          <span class="truncate font-mono text-[11px]">{{ file }}</span>
        </div>
        <div v-if="folderFilesFor(row).length > FOLDER_FILE_PREVIEW" class="py-0.5 text-[10px] text-muted-foreground" :style="indent(row.depth + 2)">
          +{{ folderFilesFor(row).length - FOLDER_FILE_PREVIEW }} more file{{ folderFilesFor(row).length - FOLDER_FILE_PREVIEW === 1 ? '' : 's' }}
        </div>
      </template>
    </template>

    <!-- Rows whose path cannot be placed in the tree (invalid container path). -->
    <div v-if="model.unplaced.length" class="mt-2 space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
      <p class="text-[11px] font-medium text-amber-800 dark:text-amber-300">Not placed, not an absolute container path:</p>
      <div v-for="(marker, i) in model.unplaced" :key="i" class="flex items-center gap-1.5">
        <Badge :variant="MARKER_VARIANT[marker.kind]" class="shrink-0 px-1.5 text-[9px] uppercase">{{ MARKER_LABEL[marker.kind] }}</Badge>
        <template v-if="editing && editing.marker === marker">
          <Input
            v-model="editing.value"
            class="h-6 min-w-0 flex-1 font-mono text-xs"
            aria-label="Path"
            autofocus
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="cancelEdit"
            @blur="commitEdit"
          />
        </template>
        <template v-else>
          <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-800 dark:text-amber-300">{{ marker.raw || '(empty)' }}</span>
          <Button v-if="!disabled && marker.index !== undefined" variant="ghost" size="icon-sm" class="h-5 w-5" aria-label="Edit path" @click="startEditMarker(marker)">
            <Pencil class="size-3" />
          </Button>
          <Button v-if="!disabled && marker.index !== undefined" variant="ghost" size="icon-sm" class="h-5 w-5 text-muted-foreground hover:text-destructive" aria-label="Remove" @click="removeMarker(marker)">
            <X class="size-3" />
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>
