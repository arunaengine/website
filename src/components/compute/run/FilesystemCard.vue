<script setup lang="ts">
// What the run sees at run time: staged inputs, the script and the paths that
// are captured afterwards. The tree is the default; the table edits the same
// rows in grids.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import ContainerFsTree from '@/components/compute/ContainerFsTree.vue'
import TesInputsEditor from '@/components/compute/TesInputsEditor.vue'
import RunSection from '@/components/compute/run/RunSection.vue'
import {
  DATA_VIEWS,
  injectCustomRun,
  isDirCapture,
  outputDestination,
} from '@/composables/useCustomRun'
import { FileText, Folder, ListPlus, Plus, X } from '@lucide/vue'

const {
  dataView,
  inputs,
  outputRows,
  treeOutputs,
  bucketOptions,
  hasScript,
  scriptPath,
  scriptUrl,
  activeWorkdir,
  inputsValid,
  outputsValid,
  addOutputRow,
  removeOutputRow,
  removeInputEntry,
  setOutputPath,
  setOutputKey,
  setOutputDestination,
  onOutputKeyBlur,
  onTreeInputPath,
  onTreeOutputPath,
  onTreeAddOutput,
  onTreeAddFile,
  onTreeAddInput,
  openInputDialog,
  useInputAsScript,
  unmarkScript,
  setScriptPath,
} = injectCustomRun()

const complete = computed(
  () => outputRows.value.length > 0 && outputsValid.value && inputsValid.value,
)
const checkLabel = computed(() => {
  if (!outputRows.value.length) return 'No output captured'
  if (!outputsValid.value) return 'An output needs a bucket and key'
  if (!inputsValid.value) return 'An input path is not valid'
  return 'Complete'
})
</script>

<template>
  <RunSection
    id="section-data"
    title="Container filesystem"
    :complete="complete"
    :check-label="checkLabel"
  >
    <template #state>
      <template v-if="complete">
        {{ inputs.length }} input{{ inputs.length === 1 ? '' : 's' }} ·
        {{ outputRows.length }} output{{ outputRows.length === 1 ? '' : 's' }}
      </template>
      <template v-else-if="!outputRows.length">Capture at least one output.</template>
      <template v-else-if="!outputsValid">An output needs a bucket and a key.</template>
      <template v-else>An input path is not valid.</template>
    </template>
    <template #controls>
      <OptionToggle v-model="dataView" :options="DATA_VIEWS" aria-label="Container data view" />
    </template>

    <section v-if="dataView === 'tree'" data-tutorial="run-filesystem" class="surface-inline space-y-2.5 p-3.5">
      <div class="flex items-center gap-2">
        <p class="flex-1 text-[11px] text-muted-foreground">
          What the run sees at run time. Use a folder's + menu to add things there.
          <DocsLink topic="compute-run" label="Docs" class="inline-flex align-baseline" />
        </p>
        <Button data-tutorial="run-add-input" variant="outline" size="sm" @click="openInputDialog()">
          <ListPlus class="size-3.5" /> Add input
        </Button>
        <Button id="run-add-output" variant="outline" size="sm" @click="addOutputRow">
          <Plus class="size-3.5" /> Add output
        </Button>
      </div>
      <div id="run-tree">
        <ContainerFsTree
          :inputs="inputs"
          :outputs="treeOutputs"
          :script="hasScript ? { path: scriptPath, label: scriptUrl } : null"
          :workspace="activeWorkdir"
          :bucket-options="bucketOptions"
          @update-input-path="onTreeInputPath"
          @remove-input="removeInputEntry"
          @update-output-path="onTreeOutputPath"
          @update-output-destination="setOutputDestination"
          @remove-output="removeOutputRow"
          @add-output="onTreeAddOutput"
          @add-output-file="onTreeAddFile"
          @add-input="onTreeAddInput"
          @use-as-script="useInputAsScript"
          @update-script-path="setScriptPath"
          @unmark-script="unmarkScript"
        />
      </div>
      <p v-if="!inputsValid" class="text-[11px] text-destructive">
        Each input needs an absolute container path, unique across all staged files.
      </p>
      <p v-if="outputRows.length && !outputsValid" class="text-[11px] text-destructive">
        Each capture needs a bucket and a canonical key; a folder capture (path ending in /) needs a key ending in /.
      </p>
    </section>

    <template v-else>
      <div class="space-y-3">
        <TesInputsEditor v-model="inputs" />
        <div class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Outputs</h3>
          <div
            v-for="(row, i) in outputRows"
            :key="i"
            class="surface-inline grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2 p-3"
          >
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-end gap-3">
                <div class="min-w-0 flex-1">
                  <label class="text-xs font-medium text-foreground">Capture <span class="text-muted-foreground">(container path)</span></label>
                  <Input
                    :model-value="row.path"
                    class="mt-1 font-mono"
                    placeholder="/work/out/result.txt"
                    aria-label="Container path to capture"
                    @update:model-value="setOutputPath(row, String($event))"
                  />
                </div>
                <span class="pb-2.5 text-xs text-muted-foreground">into</span>
                <div class="w-44">
                  <label class="text-xs font-medium text-foreground">Bucket</label>
                  <Select
                    v-if="bucketOptions.length"
                    v-model="row.bucket"
                    :options="bucketOptions"
                    placeholder="Bucket"
                    class="mt-1"
                    aria-label="Destination bucket"
                  />
                  <Input v-else v-model="row.bucket" class="mt-1 font-mono" placeholder="my-results" aria-label="Destination bucket" />
                </div>
                <div class="min-w-0 flex-1">
                  <label class="text-xs font-medium text-foreground">Key</label>
                  <Input
                    :model-value="row.key"
                    class="mt-1 font-mono"
                    placeholder="runs/result.txt"
                    aria-label="Destination key"
                    @update:model-value="setOutputKey(row, String($event))"
                    @blur="onOutputKeyBlur(row)"
                  />
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
            <Button variant="ghost" size="icon-sm" class="self-center text-destructive hover:text-destructive" aria-label="Remove output" @click="removeOutputRow(i)">
              <X class="h-4 w-4" />
            </Button>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" @click="openInputDialog()"><ListPlus class="size-3.5" /> Add input</Button>
            <Button variant="outline" size="sm" @click="addOutputRow"><Plus class="size-3.5" /> Add output</Button>
          </div>
          <p v-if="outputRows.length && !outputsValid" class="text-[11px] text-destructive">
            Each capture needs a bucket and a canonical key; a folder capture (path ending in /) needs a key ending in /.
          </p>
        </div>
      </div>
    </template>
    <p class="mt-2 text-[11px] text-muted-foreground">stdout and stderr are always captured.</p>
  </RunSection>
</template>
