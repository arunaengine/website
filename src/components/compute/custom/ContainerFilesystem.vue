<script setup lang="ts">
// Inputs and captures of the custom run, as the filesystem tree or the row
// grids; both edit the same draft state.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import ContainerFsTree from '@/components/compute/ContainerFsTree.vue'
import TesInputsEditor from '@/components/compute/TesInputsEditor.vue'
import { DATA_VIEWS, injectCustomRun, isDirCapture, outputDestination } from '@/composables/useCustomRun'
import { FileText, Folder, ListPlus, Plus, X } from '@lucide/vue'

const {
  dataView,
  inputs,
  executors,
  outputRows,
  outputsValid,
  treeOutputs,
  bucketOptions,
  onOutputKeyBlur,
  addOutputRow,
  removeOutputRow,
  removeInputEntry,
  onTreeInputPath,
  onTreeOutputPath,
  onTreeAddOutput,
  onTreeAddInput,
  openInputDialog,
} = injectCustomRun()
</script>

<template>
  <div data-tutorial="run-filesystem" class="min-w-0 space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Container filesystem</h2>
      <FilterChips v-model="dataView" :options="DATA_VIEWS" aria-label="Container data view" />
    </div>

    <section v-if="dataView === 'tree'" class="surface-inline space-y-2.5 p-3.5">
      <p class="text-[11px] text-muted-foreground">
        What the run sees at run time. Use a folder's + menu to create subfolders, stage inputs, or capture outputs.
      </p>
      <ContainerFsTree
        :inputs="inputs"
        :outputs="treeOutputs"
        :workspace="executors[0]?.workdir || null"
        @update-input-path="onTreeInputPath"
        @remove-input="removeInputEntry"
        @update-output-path="onTreeOutputPath"
        @remove-output="removeOutputRow"
        @add-output="onTreeAddOutput"
        @add-input="onTreeAddInput"
      >
        <template #output-details="{ index }">
          <div v-if="outputRows[index]" class="flex items-center gap-1.5">
            <span class="shrink-0 text-[10px] font-medium text-muted-foreground">into</span>
            <Select
              v-if="bucketOptions.length"
              v-model="outputRows[index].bucket"
              :options="bucketOptions"
              placeholder="Bucket"
              class="h-7 w-32 shrink-0 text-xs"
              aria-label="Destination bucket"
            />
            <Input v-else v-model="outputRows[index].bucket" class="h-7 w-32 shrink-0 font-mono text-xs" placeholder="my-results" aria-label="Destination bucket" />
            <span class="shrink-0 text-muted-foreground">/</span>
            <Input
              v-model="outputRows[index].key"
              class="h-7 min-w-0 flex-1 font-mono text-xs"
              placeholder="runs/result.txt"
              aria-label="Destination key"
              @blur="onOutputKeyBlur(outputRows[index])"
            />
          </div>
        </template>
      </ContainerFsTree>
      <p v-if="outputRows.length && !outputsValid" class="text-[11px] text-destructive">
        Every capture needs an absolute container path, one bucket and a canonical key; folder captures (path ending in /) need a key ending in /; container paths and destinations must be unique.
      </p>
      <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Button data-tutorial="run-add-input" variant="outline" size="sm" @click="openInputDialog"><ListPlus class="size-3.5" /> Add input</Button>
        <Button variant="outline" size="sm" @click="addOutputRow"><Plus class="size-3.5" /> Add output</Button>
      </div>
      <p class="text-[11px] text-muted-foreground">A folder capture (path ending in /) uploads the files the run wrote directly in that folder. Nested subfolders are not captured.</p>
    </section>

    <template v-else>
      <TesInputsEditor v-model="inputs" />
      <div class="space-y-3">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Outputs</h2>
        <!-- Same row grid as TesInputsEditor: flexible content column plus
             a fixed 1.75rem action column so both editors share one right
             edge for controls and remove buttons. -->
        <div v-for="(row, i) in outputRows" :key="i" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2 p-3">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-end gap-3">
              <div class="min-w-0 flex-1">
                <label class="text-xs font-medium text-foreground">Capture <span class="text-muted-foreground">(container path)</span></label>
                <Input v-model="row.path" class="mt-1 font-mono" placeholder="/outputs/result.txt" aria-label="Container path to capture" />
              </div>
              <span class="pb-2.5 text-xs text-muted-foreground">into</span>
              <div class="w-44">
                <label class="text-xs font-medium text-foreground">Bucket</label>
                <Select v-if="bucketOptions.length" v-model="row.bucket" :options="bucketOptions" placeholder="Bucket" class="mt-1" aria-label="Destination bucket" />
                <Input v-else v-model="row.bucket" class="mt-1 font-mono" placeholder="my-results" aria-label="Destination bucket" />
              </div>
              <div class="min-w-0 flex-1">
                <label class="text-xs font-medium text-foreground">Key</label>
                <Input v-model="row.key" class="mt-1 font-mono" placeholder="runs/result.txt" aria-label="Destination key" @blur="onOutputKeyBlur(row)" />
              </div>
            </div>
            <div class="flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <Badge variant="outline" size="sm" class="shrink-0 gap-1 font-sans">
                <component :is="isDirCapture(row.path) ? Folder : FileText" class="h-3 w-3" />
                {{ isDirCapture(row.path) ? 'Folder' : 'File' }}
              </Badge>
              <span class="truncate" :title="outputDestination(row)">{{ outputDestination(row) }}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" class="self-center text-destructive hover:text-destructive" aria-label="Remove output" @click="removeOutputRow(i)"><X class="h-4 w-4" /></Button>
        </div>
        <Button variant="outline" size="sm" @click="addOutputRow"><Plus class="size-3.5" /> Add output</Button>
        <p class="text-[11px] text-muted-foreground">A folder capture (container path ending in /) uploads the files the run wrote directly in that folder. Nested subfolders are not captured.</p>
        <p v-if="outputRows.length && !outputsValid" class="text-[11px] text-destructive">
          Every capture needs an absolute container path, one bucket and a canonical key; folder captures (path ending in /) need a key ending in /; container paths and destinations must be unique.
        </p>
      </div>
    </template>
  </div>
</template>
