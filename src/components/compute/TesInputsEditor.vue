<script setup lang="ts">
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import type { TesDataRefEntry } from '@/lib/tes'
import { truncateMiddle } from '@/lib/utils'
import { Folder, ListPlus, X } from '@lucide/vue'

// Input row editor (aruna#290): never mutates the prop; every change emits a
// fresh array. New rows come from the TesDataRefDialog picker. Files keep an
// inline-editable container path; a folder is ONE summary row whose base path
// is editable and which expands to per-file FILE inputs at task assembly
// (lib/tes expandDataRefEntry) because the facade accepts FILE inputs only.
const props = defineProps<{ modelValue: TesDataRefEntry[]; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: TesDataRefEntry[]): void }>()

const dialogOpen = ref(false)

function addEntry(entry: TesDataRefEntry) {
  emit('update:modelValue', [...props.modelValue, entry])
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
</script>

<template>
  <div class="space-y-3">
    <p v-if="!modelValue.length" class="text-sm text-muted-foreground">
      No inputs, the task starts with an empty working directory.
    </p>
    <div v-else class="space-y-2">
      <!-- Shared row grid with the outputs step (ComputeSubmitView): flexible
           content column plus a fixed 1.75rem action column so control right
           edges and remove buttons line up across both editors. -->
      <div v-for="(entry, i) in modelValue" :key="i" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2 p-3">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <template v-if="entry.kind === 'folder'">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 truncate text-[11px] text-foreground" :title="`s3://${entry.bucket}/${entry.prefix}`">
                <Folder class="h-3.5 w-3.5 shrink-0 text-primary" />
                <span class="truncate font-mono">{{ entry.name }}/</span>
                <span class="shrink-0 text-muted-foreground">{{ entry.files.length }} file{{ entry.files.length === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <Badge variant="outline">FOLDER</Badge>
            <div class="w-full sm:w-64">
              <Input
                :model-value="entry.basePath"
                class="font-mono"
                :disabled="disabled"
                aria-label="Container base path"
                @update:model-value="patchPath(i, String($event))"
              />
            </div>
          </template>
          <template v-else>
            <div class="min-w-0 flex-1">
              <div class="truncate font-mono text-[11px] text-foreground" :title="entry.url">{{ truncateMiddle(entry.url || '', 20, 16) }}</div>
            </div>
            <Badge variant="outline">FILE</Badge>
            <div class="w-full sm:w-64">
              <Input
                :model-value="entry.path"
                class="font-mono"
                :disabled="disabled"
                aria-label="Container path"
                @update:model-value="patchPath(i, String($event))"
              />
            </div>
          </template>
        </div>
        <Button variant="ghost" size="icon-sm" class="self-center" :disabled="disabled" aria-label="Remove input" @click="remove(i)"><X class="h-4 w-4" /></Button>
      </div>
    </div>

    <Button variant="outline" size="sm" :disabled="disabled" @click="dialogOpen = true"><ListPlus class="size-3.5" /> Add input</Button>

    <TesDataRefDialog v-model:open="dialogOpen" mode="input" mount-default="/inputs/" @add="addEntry" />
  </div>
</template>
