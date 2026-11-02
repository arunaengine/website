<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import InputLocalityHint from '@/components/compute/InputLocalityHint.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { groupInputs, type InputGroup } from '@/lib/fileGroups'
import { inputPlace, type TesDataRefEntry } from '@/lib/tes'
import { ChevronRight, Folder, ListPlus, X } from '@lucide/vue'

// Input row editor (aruna#290): never mutates the prop; every change emits a
// fresh array. New rows come from the run form's picker (add). Files keep an
// inline-editable container path; a folder is ONE summary row whose base path
// is editable. It becomes one DIRECTORY input, or one FILE input per listed
// file, at run assembly (lib/tes expandDataRefEntry).
const props = defineProps<{ modelValue: TesDataRefEntry[]; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: TesDataRefEntry[]): void; (e: 'add'): void }>()

const { displayName, isLocalNode } = useRealmNodes()
const nodeOf = (url: string) => {
  const node = inputPlace(url).nodeId
  return node && !isLocalNode(node) ? displayName(node) : ''
}

function patchPath(i: number, path: string) {
  emit(
    'update:modelValue',
    props.modelValue.map((entry, idx) =>
      idx === i
        ? entry.kind === 'folder'
          ? { ...entry, basePath: path }
          : { ...entry, path }
        : entry,
    ),
  )
}
function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}

// Many files of one bucket folder, such as a restored run's database, read as one row until opened.
type Picked = { url: string; path: string; index: number }
type Row = { kind: 'entry'; index: number; entry: TesDataRefEntry; nested: boolean } | { kind: 'group'; key: string; files: InputGroup<Picked> }
const opened = ref(new Set<string>())
function toggle(key: string) {
  const next = new Set(opened.value)
  if (!next.delete(key)) next.add(key)
  opened.value = next
}
const rows = computed<Row[]>(() => {
  const files = props.modelValue.flatMap((entry, index) => (entry.kind === 'file' ? [{ url: entry.url, path: entry.path, index }] : []))
  const groups = new Map(groupInputs(files).filter((group) => group.inputs.length > 1).flatMap((group) => group.inputs.map((file) => [file.index, group] as const)))
  return props.modelValue.flatMap((entry, index): Row[] => {
    const group = groups.get(index)
    if (!group) return [{ kind: 'entry', index, entry, nested: false }]
    if (group.inputs[0]!.index !== index) return []
    const key = group.group.key
    const files = opened.value.has(key) ? group.inputs.map((file): Row => ({ kind: 'entry', index: file.index, entry: props.modelValue[file.index]!, nested: true })) : []
    return [{ kind: 'group', key, files: group }, ...files]
  })
})
function removeGroup(group: InputGroup<Picked>) {
  const gone = new Set(group.inputs.map((file) => file.index))
  emit('update:modelValue', props.modelValue.filter((_, idx) => !gone.has(idx)))
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="!modelValue.length" class="text-sm text-muted-foreground">
      No inputs; the run starts with an empty working directory.
    </p>
    <div v-else data-tutorial="run-inputs" class="space-y-2">
      <!-- Shared row grid with the outputs step (ComputeSubmitView): flexible
           content column plus a fixed 1.75rem action column so control right
           edges and remove buttons line up across both editors. -->
      <template v-for="row in rows" :key="row.kind === 'group' ? row.key : row.index">
      <div v-if="row.kind === 'group'" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2 p-3">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <button type="button" class="flex max-w-full items-center gap-1.5 text-left text-xs text-foreground hover:text-primary" :aria-expanded="opened.has(row.key)" :title="row.files.mount" @click="toggle(row.key)">
              <ChevronRight class="h-3.5 w-3.5 shrink-0 transition-transform" :class="opened.has(row.key) ? 'rotate-90' : ''" aria-hidden="true" />
              <Folder class="h-3.5 w-3.5 shrink-0 text-primary" />
              <span class="truncate font-mono">{{ row.files.group.bucket }}/{{ row.files.group.folder }}</span>
              <span class="shrink-0 text-muted-foreground">{{ row.files.inputs.length }} files</span>
            </button>
            <div v-if="row.files.group.nodeId && !isLocalNode(row.files.group.nodeId)" class="truncate pl-5 text-xs text-muted-foreground">on {{ displayName(row.files.group.nodeId) }}</div>
          </div>
          <Badge variant="outline">FOLDER</Badge>
          <div class="w-full truncate font-mono text-xs text-muted-foreground sm:w-64">{{ row.files.mount }}</div>
        </div>
        <Button variant="ghost" size="icon-sm" class="self-center" :disabled="disabled" aria-label="Remove these inputs" @click="removeGroup(row.files)"><X class="h-4 w-4" /></Button>
      </div>
      <div v-else class="surface-inline grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2 p-3" :class="row.nested ? 'ml-6' : ''">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <template v-if="row.entry.kind === 'folder'">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 truncate text-xs text-foreground" :title="`s3://${row.entry.bucket}/${row.entry.prefix}`">
                <Folder class="h-3.5 w-3.5 shrink-0 text-primary" />
                <span class="truncate font-mono">{{ row.entry.name }}/</span>
                <span v-if="row.entry.directory" class="shrink-0 text-muted-foreground">all files</span>
                <span v-else class="shrink-0 text-muted-foreground">{{ row.entry.files.length }} file{{ row.entry.files.length === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <Badge variant="outline">FOLDER</Badge>
            <div class="w-full sm:w-64">
              <Input
                :model-value="row.entry.basePath"
                class="font-mono"
                :disabled="disabled"
                aria-label="Container base path"
                @update:model-value="patchPath(row.index, String($event))"
              />
            </div>
          </template>
          <template v-else>
            <div class="min-w-0 flex-1">
              <div class="truncate font-mono text-xs text-foreground" :title="row.entry.url">{{ inputPlace(row.entry.url || '').text }}</div>
              <div v-if="nodeOf(row.entry.url || '')" class="truncate text-xs text-muted-foreground">on {{ nodeOf(row.entry.url || '') }}</div>
            </div>
            <Badge variant="outline">FILE</Badge>
            <div class="w-full sm:w-64">
              <Input
                :model-value="row.entry.path"
                class="font-mono"
                :disabled="disabled"
                aria-label="Container path"
                @update:model-value="patchPath(row.index, String($event))"
              />
            </div>
          </template>
        </div>
        <Button variant="ghost" size="icon-sm" class="self-center" :disabled="disabled" aria-label="Remove input" @click="remove(row.index)"><X class="h-4 w-4" /></Button>
        <div v-if="row.entry.kind === 'file' && row.entry.url" class="col-span-2 pt-1.5">
          <InputLocalityHint :url="row.entry.url" />
        </div>
      </div>
      </template>
    </div>
    <p v-if="modelValue.some((entry) => entry.kind === 'file')" class="text-xs text-muted-foreground">
      Locality is a hint about where these files already are. The node plans the run itself and can
      still place it elsewhere.
    </p>

    <Button data-tutorial="run-add-input" variant="outline" size="sm" :disabled="disabled" @click="emit('add')"><ListPlus class="size-3.5" /> Add input</Button>
  </div>
</template>
