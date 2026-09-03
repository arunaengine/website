<script setup lang="ts">
// Data references of a quick run: the filesystem tree by default, the row grids
// as the Table alternative; both operate on the same inputs and captures.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import ContainerFsTree from '@/components/compute/ContainerFsTree.vue'
import InputLocalityHint from '@/components/compute/InputLocalityHint.vue'
import {
  DATA_VIEWS,
  injectQuickRun,
  isDirCapture,
  outputDestination,
  validOutputContainerPath,
} from '@/composables/useQuickRun'
import { validContainerDir, validContainerFilePath as validContainerPath } from '@/lib/tes'
import { ArrowDownToLine, ArrowUpFromLine, FileText, Folder, ListPlus, Plus, X } from '@lucide/vue'

const {
  dataView,
  inputs,
  outputRows,
  treeOutputs,
  bucketOptions,
  activeWorkdir,
  scriptContainerPath,
  scriptUrl,
  inputsValid,
  outputsValid,
  addOutput,
  removeInput,
  removeOutput,
  setOutputContainerPath,
  setOutputKey,
  onOutputKeyBlur,
  onTreeInputPath,
  onTreeOutputPath,
  onTreeAddOutput,
  onTreeAddInput,
  openInputDialog,
} = injectQuickRun()
</script>

<template>
  <div data-tour="quickrun-container" class="min-w-0 space-y-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-semibold text-foreground">Container data</span>
      <FilterChips v-model="dataView" :options="DATA_VIEWS" aria-label="Container data view" />
    </div>

    <section v-if="dataView === 'tree'" class="surface-muted space-y-2.5 p-3.5">
      <p class="text-[11px] text-muted-foreground">
        The container filesystem as the script will see it. Use a folder's + menu to create subfolders, stage inputs, or capture outputs.
      </p>
      <ContainerFsTree
        :inputs="inputs"
        :outputs="treeOutputs"
        :script="{ path: scriptContainerPath, label: scriptUrl }"
        :workspace="activeWorkdir"
        @update-input-path="onTreeInputPath"
        @remove-input="removeInput"
        @update-output-path="onTreeOutputPath"
        @remove-output="removeOutput"
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
            <Input v-else v-model="outputRows[index].bucket" class="h-7 w-32 shrink-0 font-mono text-xs" placeholder="bucket" aria-label="Destination bucket" />
            <span class="shrink-0 text-muted-foreground">/</span>
            <Input
              :model-value="outputRows[index].path"
              class="h-7 min-w-0 flex-1 font-mono text-xs"
              placeholder="results/output.txt"
              aria-label="Destination key"
              @update:model-value="setOutputKey(outputRows[index], String($event))"
              @blur="onOutputKeyBlur(outputRows[index])"
            />
          </div>
        </template>
      </ContainerFsTree>
      <p v-if="!inputsValid" class="text-[11px] text-destructive">
        Each input needs an absolute canonical container path (folders a base directory), unique across all staged files.
      </p>
      <p v-if="!outputsValid" class="text-[11px] text-destructive">
        Each capture needs one of your buckets, a canonical key and an absolute container path; folder captures (path ending in /) need a key ending in /; container paths and destinations must be unique.
      </p>
      <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Button variant="outline" size="sm" @click="openInputDialog"><ListPlus class="size-3.5" /> Add input</Button>
        <Button variant="outline" size="sm" @click="addOutput"><Plus class="size-3.5" /> Add output</Button>
      </div>
    </section>

    <template v-else>
      <section class="surface-muted space-y-2.5 p-3.5">
        <div>
          <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Input data
          </div>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Staged read-only before the script starts, by default under <code class="rounded bg-muted px-1 font-mono">{{ activeWorkdir }}/in/</code>. Paths are editable.
          </p>
        </div>
        <div v-if="inputs.length" class="space-y-1.5">
          <!-- Shared row grid with the output section: flexible content
               column plus a fixed 1.25rem action column so control
               right edges and remove buttons line up across both. -->
          <div v-for="(input, i) in inputs" :key="i" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.25rem] gap-x-1.5 p-2 text-xs">
            <div v-if="input.kind === 'folder'" class="min-w-0 space-y-1">
              <Input
                v-model="input.basePath"
                class="h-7 font-mono text-xs"
                aria-label="Container base path"
                :invalid="!validContainerDir(input.basePath) ? 'error' : undefined"
              />
              <div class="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground" :title="`s3://${input.bucket}/${input.prefix}`">
                <Folder class="h-3 w-3 shrink-0 text-primary/70" />
                <span class="truncate">{{ input.name }}/ · {{ input.files.length }} file{{ input.files.length === 1 ? '' : 's' }} · s3://{{ input.bucket }}/{{ input.prefix }}</span>
              </div>
            </div>
            <div v-else class="min-w-0 space-y-1">
              <Input
                v-model="input.path"
                class="h-7 font-mono text-xs"
                aria-label="Container path"
                :invalid="!validContainerPath(input.path.trim()) ? 'error' : undefined"
              />
              <div class="truncate font-mono text-[10px] text-muted-foreground" :title="input.url">{{ input.url }}</div>
              <InputLocalityHint :url="input.url" />
            </div>
            <Button variant="ghost" size="icon-sm" class="mt-1 h-5 w-5 self-start" aria-label="Remove input" @click="removeInput(i)"><X class="size-3" /></Button>
          </div>
          <p v-if="!inputsValid" class="text-[11px] text-destructive">
            Each input needs an absolute canonical container path (folders a base directory), unique across all staged files.
          </p>
        </div>
        <p v-else class="text-[11px] text-muted-foreground">No input data. Added files are staged into the container, by default under <code class="rounded bg-muted px-1 font-mono">{{ activeWorkdir }}/in/</code>.</p>
        <Button variant="outline" size="sm" @click="openInputDialog"><ListPlus class="size-3.5" /> Add input</Button>
      </section>

      <section class="surface-muted space-y-2.5 p-3.5">
        <div>
          <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Output data
          </div>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Captures files or folders the script writes, by default under <code class="rounded bg-muted px-1 font-mono">{{ activeWorkdir }}/out/</code>, into a bucket after the run. A container path ending in / captures the files written directly in that folder; nested subfolders are not.
          </p>
        </div>
        <div v-if="outputRows.length" class="space-y-1.5">
          <!-- Same row grid as the input section above; every control
               line ends at the shared content-column edge. -->
          <div v-for="(row, i) in outputRows" :key="i" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.25rem] gap-x-1.5 p-2 text-xs">
            <div class="min-w-0 space-y-1.5">
              <div>
                <label class="text-[10px] font-medium text-muted-foreground">Capture</label>
                <div class="mt-0.5 flex items-center gap-1.5">
                  <Input
                    :model-value="row.containerPath"
                    class="h-7 min-w-0 flex-1 font-mono text-xs"
                    :placeholder="`${activeWorkdir}/out/result.txt`"
                    aria-label="Container path to capture"
                    :invalid="!validOutputContainerPath(row.containerPath) ? 'error' : undefined"
                    @update:model-value="setOutputContainerPath(row, String($event))"
                  />
                  <Badge variant="outline" size="sm" class="shrink-0 gap-1">
                    <component :is="isDirCapture(row.containerPath) ? Folder : FileText" class="h-3 w-3" />
                    {{ isDirCapture(row.containerPath) ? 'Folder' : 'File' }}
                  </Badge>
                </div>
              </div>
              <div>
                <label class="text-[10px] font-medium text-muted-foreground">into</label>
                <div class="mt-0.5 flex items-center gap-1.5">
                  <Select
                    v-if="bucketOptions.length"
                    v-model="row.bucket"
                    :options="bucketOptions"
                    placeholder="Bucket"
                    class="h-7 w-32 shrink-0 text-xs"
                    aria-label="Destination bucket"
                  />
                  <Input v-else v-model="row.bucket" class="h-7 w-32 shrink-0 font-mono text-xs" placeholder="bucket" aria-label="Destination bucket" />
                  <span class="shrink-0 text-muted-foreground">/</span>
                  <Input
                    :model-value="row.path"
                    class="h-7 min-w-0 flex-1 font-mono text-xs"
                    placeholder="results/output.txt"
                    aria-label="Destination key"
                    @update:model-value="setOutputKey(row, String($event))"
                    @blur="onOutputKeyBlur(row)"
                  />
                </div>
              </div>
              <div class="truncate font-mono text-[10px] text-muted-foreground" :title="outputDestination(row)">{{ outputDestination(row) }}</div>
            </div>
            <Button variant="ghost" size="icon-sm" class="mt-1 h-5 w-5 self-start" aria-label="Remove output" @click="removeOutput(i)"><X class="size-3" /></Button>
          </div>
        </div>
        <p v-else class="text-[11px] text-muted-foreground">Nothing captured yet.</p>
        <p v-if="!outputsValid" class="text-[11px] text-destructive">
          Each capture needs one of your buckets, a canonical key and an absolute container path; folder captures (path ending in /) need a key ending in /; container paths and destinations must be unique.
        </p>
        <Button variant="outline" size="sm" @click="addOutput"><Plus class="size-3.5" /> Add output</Button>
      </section>
    </template>
    <p class="text-[11px] text-muted-foreground">stdout and stderr are always captured.</p>
  </div>
</template>
