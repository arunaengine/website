<script setup lang="ts">
// The group's dataset folders as one flat list of indented rows. Folders exist
// only through the datasets in them, so a folder created here stays pending
// until the dataset is saved.
import { computed, ref, watch } from 'vue'
import { ChevronRight, FileText, Folder } from '@lucide/vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { buildMetaPathTree, type MetaPathFolder } from '@/components/groups/permission-paths'
import { covered, documentPrefixes, isReservedFolder } from '@/lib/crate/paths'

const props = defineProps<{
  modelValue: string
  documentPaths: string[]
  grants: string[]
  pending: string[]
  loading?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', prefix: string): void }>()

interface Row {
  kind: 'folder' | 'document'
  path: string
  name: string
  depth: number
  isNew: boolean
  disabled: boolean
  expandable: boolean
  open: boolean
}

function chain(prefix: string): string[] {
  const segments = prefix.split('/').filter(Boolean)
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'))
}

function folderAt(root: MetaPathFolder, path: string): void {
  let node = root
  for (const step of chain(path)) {
    let child = node.folders.find((folder) => folder.path === step)
    if (!child) {
      child = { name: step.split('/').pop() ?? '', path: step, folders: [], documents: [] }
      node.folders.push(child)
    }
    node = child
  }
}

const stored = computed(() => new Set(documentPrefixes(props.documentPaths)))
const tree = computed(() => {
  const root = buildMetaPathTree(props.documentPaths)
  root.folders = root.folders.filter((folder) => !isReservedFolder(folder.name))
  for (const path of props.pending) folderAt(root, path)
  return root
})

const expanded = ref(new Set<string>())
watch(() => props.documentPaths, () => {
  expanded.value = new Set([...tree.value.folders.map((folder) => folder.path), ...chain(props.modelValue)])
}, { immediate: true })
watch(() => props.modelValue, (prefix) => {
  for (const path of chain(prefix)) expanded.value.add(path)
})

function blocked(prefix: string): boolean {
  return props.grants.length > 0 && !covered(prefix, props.grants)
}

const rows = computed(() => {
  const list: Row[] = []
  const walk = (node: MetaPathFolder, depth: number) => {
    for (const folder of node.folders) {
      const open = expanded.value.has(folder.path)
      list.push({
        kind: 'folder',
        path: folder.path,
        name: folder.name,
        depth,
        isNew: props.pending.includes(folder.path) && !stored.value.has(folder.path),
        disabled: blocked(folder.path),
        expandable: folder.folders.length > 0 || folder.documents.length > 0,
        open,
      })
      if (open) walk(folder, depth + 1)
    }
    for (const document of node.documents) {
      list.push({
        kind: 'document',
        path: document.path,
        name: document.name,
        depth,
        isNew: false,
        disabled: true,
        expandable: false,
        open: false,
      })
    }
  }
  walk(tree.value, 1)
  return list
})

function toggle(path: string) {
  if (expanded.value.has(path)) expanded.value.delete(path)
  else expanded.value.add(path)
}

function indent(depth: number) {
  return { paddingLeft: `${depth * 16}px` }
}
</script>

<template>
  <div>
    <div v-if="loading" class="space-y-1.5 py-1">
      <Skeleton class="h-7 w-full" />
      <Skeleton class="h-7 w-2/3" />
    </div>
    <ul v-else role="tree" aria-label="Folders" class="max-h-56 space-y-0.5 overflow-y-auto py-1">
      <li role="treeitem" :aria-level="1" :aria-selected="modelValue === ''">
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          :class="modelValue === '' ? 'bg-primary/10 text-primary' : 'text-foreground'"
          :disabled="blocked('')"
          :title="blocked('') ? 'Your roles cannot write here' : undefined"
          @click="emit('update:modelValue', '')"
        >
          <span class="w-3 shrink-0" />
          <Folder class="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span>Group root</span>
        </button>
      </li>
      <li
        v-for="row in rows"
        :key="`${row.kind}:${row.path}`"
        role="treeitem"
        :aria-level="row.depth + 1"
        :aria-selected="row.kind === 'folder' && modelValue === row.path"
        :aria-expanded="row.expandable ? row.open : undefined"
      >
        <div v-if="row.kind === 'folder'" class="flex items-center" :style="indent(row.depth)">
          <button
            v-if="row.expandable"
            type="button"
            class="rounded p-1 text-muted-foreground hover:bg-muted"
            :aria-label="`${row.open ? 'Collapse' : 'Expand'} ${row.name}`"
            @click="toggle(row.path)"
          >
            <ChevronRight :class="['h-3 w-3 transition-transform', row.open && 'rotate-90']" />
          </button>
          <span v-else class="w-5 shrink-0" />
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            :class="modelValue === row.path ? 'bg-primary/10 text-primary' : 'text-foreground'"
            :disabled="row.disabled"
            :title="row.disabled ? 'Your roles cannot write here' : undefined"
            @click="emit('update:modelValue', row.path)"
          >
            <Folder class="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span class="truncate font-mono">{{ row.name }}</span>
            <span v-if="row.isNew" class="shrink-0 text-[10px] text-muted-foreground">(new)</span>
          </button>
        </div>
        <p
          v-else
          class="flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-xs text-muted-foreground/70"
          :style="indent(row.depth)"
        >
          <span class="w-5 shrink-0" />
          <FileText class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate font-mono">{{ row.name }}</span>
        </p>
      </li>
    </ul>
    <p v-if="!loading && !tree.folders.length" class="px-1.5 pb-1 text-[11px] text-muted-foreground">
      No folders yet. Datasets land in the group root, or create a folder below.
    </p>
  </div>
</template>
