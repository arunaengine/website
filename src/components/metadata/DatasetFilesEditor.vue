<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import SelectDataDialog from '@/components/data/SelectDataDialog.vue'
import DataEntityDialog from '@/components/metadata/DataEntityDialog.vue'
import { ref } from 'vue'
import { ChevronUp, ChevronDown, FileJson2, Info, Plus, Trash2 } from '@lucide/vue'
import type { DataEntity } from '@/lib/dataEntities'

// Shared editor for a dataset's data entities: add (SelectDataDialog buckets or
// external URL), remove, rename, reorder (hasPart order), and, when detailed,
// edit encodingFormat/contentSize/description per file. @ids are kept verbatim;
// the reference target is changed by removing and re-adding, never by editing.
// When the host passes the crate, each row gains an info dialog showing the
// entity's full stored metadata; it stacks above the hosting dialog.
const props = withDefaults(
  defineProps<{
    modelValue: DataEntity[]
    // Hidden in the create flow, whose emit shape carries only id + name.
    detailed?: boolean
    // The pristine crate the rows come from; enables the per-row info dialog.
    crate?: unknown
  }>(),
  { detailed: true, crate: undefined },
)

const emit = defineEmits<{
  (e: 'update:modelValue', files: DataEntity[]): void
}>()

const selectOpen = ref(false)
const infoOpen = ref(false)
const infoEntityId = ref('')

function openInfo(file: DataEntity) {
  infoEntityId.value = file.id
  infoOpen.value = true
}

function commit(files: DataEntity[]) {
  emit('update:modelValue', files)
}

function patch(index: number, changes: Partial<DataEntity>) {
  commit(props.modelValue.map((file, i) => (i === index ? { ...file, ...changes } : file)))
}

function remove(index: number) {
  commit(props.modelValue.filter((_, i) => i !== index))
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= props.modelValue.length) return
  const next = [...props.modelValue]
  ;[next[index], next[target]] = [next[target], next[index]]
  commit(next)
}

function onAdd(entry: { label: string; url: string }) {
  // Keep the reference verbatim and one entry per @id.
  if (props.modelValue.some((file) => file.id === entry.url)) return
  commit([...props.modelValue, { id: entry.url, name: entry.label, types: ['File'] }])
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <div>
        <label class="text-xs font-medium text-foreground">Files</label>
        <p class="text-[11px] text-muted-foreground">Each file becomes a hasPart entity in the RO-Crate.</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Badge variant="secondary">{{ modelValue.length }} {{ modelValue.length === 1 ? 'file' : 'files' }}</Badge>
        <Button variant="outline" size="sm" @click="selectOpen = true">
          <Plus class="size-3.5" /> Add file
        </Button>
      </div>
    </div>

    <p v-if="!modelValue.length" class="mt-2 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-[11px] text-muted-foreground">
      <FileJson2 class="h-3.5 w-3.5 shrink-0" /> No files referenced yet. Add objects from a bucket or an external URL.
    </p>

    <div v-for="(file, index) in modelValue" :key="file.id" class="mt-2 rounded-md border border-border bg-card">
      <div class="flex items-center gap-2 px-3 py-2">
        <div class="flex shrink-0 flex-col">
          <Button variant="ghost" size="icon-sm" class="h-5 text-muted-foreground" :disabled="index === 0" aria-label="Move file up" @click="move(index, -1)">
            <ChevronUp class="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" class="h-5 text-muted-foreground" :disabled="index === modelValue.length - 1" aria-label="Move file down" @click="move(index, 1)">
            <ChevronDown class="h-3.5 w-3.5" />
          </Button>
        </div>
        <div class="min-w-0 flex-1">
          <Input :model-value="file.name" placeholder="File name" @update:model-value="(v: string | number) => patch(index, { name: String(v) })" />
          <p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" :title="file.id">{{ file.id }}</p>
        </div>
        <Button v-if="crate !== undefined" variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" :aria-label="`Show metadata of ${file.name}`" title="File metadata" @click="openInfo(file)">
          <Info class="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Remove file" @click="remove(index)">
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
      <div v-if="detailed" class="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
        <div>
          <label class="text-[11px] font-medium text-foreground">Encoding format</label>
          <Input :model-value="file.encodingFormat ?? ''" class="mt-1 font-mono text-xs" placeholder="text/csv" @update:model-value="(v: string | number) => patch(index, { encodingFormat: String(v) })" />
        </div>
        <div>
          <label class="text-[11px] font-medium text-foreground">Content size (bytes)</label>
          <Input :model-value="file.contentSize ?? ''" class="mt-1 font-mono text-xs" inputmode="numeric" placeholder="1024" @update:model-value="(v: string | number) => patch(index, { contentSize: String(v) })" />
        </div>
        <div class="sm:col-span-2">
          <label class="text-[11px] font-medium text-foreground">Description</label>
          <Textarea :model-value="file.description ?? ''" rows="2" class="mt-1 font-sans text-xs" placeholder="Describe this file" @update:model-value="(v: string | number) => patch(index, { description: String(v) })" />
        </div>
      </div>
    </div>

    <SelectDataDialog v-model:open="selectOpen" @add="onAdd" />
    <DataEntityDialog v-if="crate !== undefined" v-model:open="infoOpen" :crate="crate" :entity-id="infoEntityId" />
  </div>
</template>
