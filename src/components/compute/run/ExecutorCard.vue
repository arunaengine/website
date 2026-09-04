<script setup lang="ts">
// What runs: a script runtime that prefills the container fields, or a custom
// image described by hand. Every field stays editable in both modes.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import RunSection from '@/components/compute/run/RunSection.vue'
import PathChips from '@/components/compute/run/PathChips.vue'
import AiMark from '@/components/compute/run/AiMark.vue'
import { injectCustomRun } from '@/composables/useCustomRun'
import { FilePlus2, Plus, X } from '@lucide/vue'

const {
  executorMode,
  runtimeId,
  runtime,
  runtimes,
  image,
  commandLine,
  commandTokens,
  envRows,
  workdir,
  workdirValid,
  setWorkdir,
  imageValid,
  commandValid,
  runtimeEdited,
  applyRuntimeDefaults,
  chooseRuntime,
  useCustomImage,
  addCustomScript,
  hasScript,
  markTouched,
  commandPaths,
  capturePath,
  setScriptPath,
  openInputDialog,
  hasAi,
  clearAi,
} = injectCustomRun()

const MODES = [
  { value: 'runtime', label: 'Script runtime' },
  { value: 'custom', label: 'Custom image' },
]

const complete = computed(() => imageValid.value && commandValid.value)
const stateText = computed(() => {
  if (complete.value) {
    return `${executorMode.value === 'runtime' ? `${runtime.value.label} runtime` : 'Custom image'} · ${image.value.trim()}`
  }
  if (!imageValid.value && !commandValid.value) return 'Needs an image and a command.'
  return imageValid.value ? 'Needs a command.' : 'Needs an image.'
})
const checkLabel = computed(() => (complete.value ? 'Complete' : 'Needs an image and a command'))

function setMode(mode: string) {
  if (mode === 'runtime') chooseRuntime(runtimeId.value)
  else useCustomImage()
}
function onImage(value: string | number) {
  image.value = String(value)
  markTouched('image')
  clearAi('image')
}
function onCommand(value: string | number) {
  commandLine.value = String(value)
  markTouched('command')
  clearAi('command')
}
function addEnv() {
  envRows.value.push({ key: '', value: '' })
  markTouched('env')
}
function removeEnv(index: number) {
  envRows.value.splice(index, 1)
  markTouched('env')
}
function addInputFor(path: string) {
  openInputDialog(path.slice(0, path.lastIndexOf('/') + 1))
}
</script>

<template>
  <RunSection id="section-executor" title="Executor" :complete="complete" :check-label="checkLabel">
    <template #state>{{ stateText }}</template>
    <template #controls>
      <OptionToggle
        :model-value="executorMode"
        :options="MODES"
        aria-label="Executor mode"
        @update:model-value="setMode"
      />
    </template>

    <fieldset v-if="executorMode === 'runtime'" class="mb-3.5">
      <legend class="sr-only">Runtime</legend>
      <div class="grid gap-2 sm:grid-cols-3">
        <label
          v-for="entry in runtimes"
          :key="entry.id"
          class="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5"
          :class="runtimeId === entry.id ? 'border-primary ring-1 ring-inset ring-primary' : 'border-border/70'"
        >
          <input
            class="sr-only"
            type="radio"
            name="run-runtime"
            :value="entry.id"
            :checked="runtimeId === entry.id"
            @change="chooseRuntime(entry.id)"
          />
          <span
            class="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px]"
            :class="runtimeId === entry.id ? 'border-primary' : 'border-border'"
            aria-hidden="true"
          >
            <span v-if="runtimeId === entry.id" class="size-[7px] rounded-full bg-primary" />
          </span>
          <span class="min-w-0">
            <span class="block text-[13px] font-semibold text-foreground">{{ entry.label }}</span>
            <span class="block text-[11px] text-muted-foreground">{{ entry.hint }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <div data-tutorial="run-executor" class="grid items-start gap-x-5 gap-y-3 sm:grid-cols-2">
      <div class="min-w-0">
        <label for="run-image" class="flex items-center gap-1.5 text-xs font-medium text-foreground">
          Image<span class="text-destructive" aria-hidden="true">*</span><span class="sr-only">(required)</span>
          <AiMark v-if="hasAi('image')" />
        </label>
        <Input
          id="run-image"
          :model-value="image"
          class="mt-1 font-mono"
          placeholder="ubuntu:22.04"
          aria-required="true"
          :aria-invalid="imageValid ? undefined : 'true'"
          aria-describedby="run-image-message"
          :invalid="imageValid ? undefined : 'error'"
          @update:model-value="onImage"
        />
        <p id="run-image-message" class="mt-1 text-[11px]" :class="imageValid ? 'text-muted-foreground' : 'text-destructive'">
          <template v-if="imageValid">Any registry the node can reach. <DocsLink topic="compute-run" label="Docs" class="inline-flex align-baseline" /></template>
          <template v-else>An image is required.</template>
        </p>
      </div>

      <div class="min-w-0">
        <label for="run-command" class="flex items-center gap-1.5 text-xs font-medium text-foreground">
          Command line<span class="text-destructive" aria-hidden="true">*</span><span class="sr-only">(required)</span>
          <AiMark v-if="hasAi('command')" />
        </label>
        <Input
          id="run-command"
          :model-value="commandLine"
          class="mt-1 font-mono"
          placeholder='python script.py "my file.csv"'
          aria-label="Command line"
          aria-required="true"
          :aria-invalid="commandValid ? undefined : 'true'"
          aria-describedby="run-command-message"
          :invalid="commandValid ? undefined : 'error'"
          @update:model-value="onCommand"
        />
        <p id="run-command-message" class="mt-1 text-[11px]" :class="commandValid ? 'text-muted-foreground' : 'text-destructive'">
          <template v-if="commandTokens.error">{{ commandTokens.error }}</template>
          <template v-else-if="!commandValid">A command is required.</template>
          <template v-else>Split like a shell, run without one. <DocsLink topic="compute-run" label="Docs" class="inline-flex align-baseline" /></template>
        </p>
        <PathChips
          class="mt-1.5"
          label="Targets:"
          :checks="commandPaths"
          :can-mount-script="hasScript"
          @capture="capturePath"
          @add-input="addInputFor"
          @mount-script="setScriptPath"
        />
      </div>

      <div class="min-w-0">
        <label for="run-workdir" class="text-xs font-medium text-foreground">Working directory</label>
        <Input
          id="run-workdir"
          :model-value="workdir"
          class="mt-1 font-mono"
          placeholder="/work"
          :invalid="workdirValid ? undefined : 'error'"
          @update:model-value="(value) => setWorkdir(String(value))"
        />
        <p class="mt-1 text-[11px]" :class="workdirValid ? 'text-muted-foreground' : 'text-destructive'">
          {{ workdirValid ? 'Inputs and outputs are placed under it.' : 'Needs an absolute directory other than /.' }}
        </p>
      </div>

      <div class="min-w-0">
        <span class="text-xs font-medium text-foreground">Environment</span>
        <div class="mt-1 space-y-1.5">
          <div v-for="(row, index) in envRows" :key="index" class="grid grid-cols-[1fr_1fr_2rem] items-center gap-1.5">
            <Input
              v-model="row.key"
              class="h-8 font-mono text-xs"
              :aria-label="`Environment key ${index + 1}`"
              @update:model-value="markTouched('env')"
            />
            <Input
              v-model="row.value"
              class="h-8 font-mono text-xs"
              :aria-label="`Environment value ${index + 1}`"
              @update:model-value="markTouched('env')"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              class="h-8 w-8 text-muted-foreground hover:text-destructive"
              :aria-label="`Remove environment variable ${index + 1}`"
              @click="removeEnv(index)"
            >
              <X class="size-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" @click="addEnv"><Plus class="size-3.5" /> Add variable</Button>
        </div>
        <p class="mt-1 text-[11px] text-muted-foreground">Added to the container environment.</p>
      </div>
    </div>

    <div v-if="executorMode === 'runtime'" class="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span>{{ runtimeEdited ? `Edited from the ${runtime.label} defaults.` : `Prefilled from the ${runtime.label} runtime; edit freely.` }}</span>
      <Button variant="link" size="sm" class="h-auto p-0 text-[11px]" @click="applyRuntimeDefaults(true)">
        Reset to runtime defaults
      </Button>
    </div>

    <div
      v-if="executorMode === 'custom' && !hasScript"
      class="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-3.5 py-2.5"
    >
      <Button variant="outline" size="sm" @click="addCustomScript"><FilePlus2 class="size-3.5" /> Add a script</Button>
      <p class="text-xs text-muted-foreground">
        Stored in your bucket, mounted into the container, called by your command.
        <DocsLink topic="compute-run" label="Docs" class="inline-flex align-baseline" />
      </p>
    </div>
  </RunSection>
</template>
