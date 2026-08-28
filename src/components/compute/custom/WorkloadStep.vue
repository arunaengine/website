<script setup lang="ts">
// The container filesystem (inputs and captures) and the executor that runs
// against it, one coherent surface, plus resources, workspace and placement.
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import ExecutorStepsEditor from '@/components/compute/ExecutorStepsEditor.vue'
import AdvancedPlacement from '@/components/compute/custom/AdvancedPlacement.vue'
import ContainerFilesystem from '@/components/compute/custom/ContainerFilesystem.vue'
import {
  MAX_RESOURCE_GB,
  MIN_RESOURCE_GB,
  U32_MAX,
  WORKSPACE_OPTIONS,
  injectCustomRun,
} from '@/composables/useCustomRun'
import { TES_STATE_META } from '@/lib/tes'

const {
  executors,
  cpuCores,
  ramGb,
  diskGb,
  preemptible,
  cpuCoresValid,
  ramGbValid,
  diskGbValid,
  executorConstraint,
  executorKindOptions,
  workspaceMode,
  workspaceBucket,
  workspaceBucketOptions,
  workspaceValid,
} = injectCustomRun()
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-5 xl:grid-cols-2">
      <ContainerFilesystem />

      <div class="min-w-0">
        <ExecutorStepsEditor v-model="executors" />
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="space-y-3">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Resources</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <div>
            <label class="text-xs font-medium text-foreground">CPU cores</label>
            <Input v-model="cpuCores" type="number" min="1" :max="U32_MAX" step="1" class="mt-1" placeholder="1" title="Allowed range: 1 to 4294967295." />
            <p v-if="!cpuCoresValid" class="mt-1 text-[11px] text-destructive">Enter a whole number of at least 1.</p>
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">RAM (GB)</label>
            <Input v-model="ramGb" type="number" :min="MIN_RESOURCE_GB" :max="MAX_RESOURCE_GB" step="any" class="mt-1" placeholder="2" title="Allowed range: 0.000000001 to 9223372036.854774 GB." />
            <p v-if="!ramGbValid" class="mt-1 text-[11px] text-destructive">Must be greater than zero.</p>
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Disk (GB)</label>
            <Input v-model="diskGb" type="number" :min="MIN_RESOURCE_GB" :max="MAX_RESOURCE_GB" step="any" class="mt-1" placeholder="10" title="Allowed range: 0.000000001 to 9223372036.854774 GB." />
            <p v-if="!diskGbValid" class="mt-1 text-[11px] text-destructive">Must be greater than zero.</p>
          </div>
        </div>
        <label class="flex items-center gap-2 text-xs font-medium text-foreground">
          <Switch v-model:checked="preemptible" /> Preemptible
        </label>
        <p class="text-[11px] text-muted-foreground">Allows the backend to run this on capacity that may be reclaimed (state {{ TES_STATE_META.PREEMPTED.label }}).</p>

        <div class="max-w-xs">
          <label class="text-xs font-medium text-foreground">Executor kind</label>
          <Select
            v-if="executorKindOptions.length"
            v-model="executorConstraint"
            :options="executorKindOptions"
            placeholder="Any kind the realm offers"
            class="mt-1"
          />
          <Input v-else v-model="executorConstraint" class="mt-1 font-mono" placeholder="docker" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{
              executorKindOptions.length
                ? 'Restricts placement to one backend kind. Leave unset to let the planner choose.'
                : 'No node has advertised an executor here yet, so this is free text. Leave it empty to let the planner choose.'
            }}
          </p>
        </div>
      </div>

      <div class="space-y-3">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Workspace</h2>
        <p class="text-[11px] text-muted-foreground">Choose how the run's scratch storage is handled.</p>
        <div class="grid gap-2 sm:grid-cols-3">
          <button
            v-for="option in WORKSPACE_OPTIONS"
            :key="option.mode"
            type="button"
            class="rounded-lg border p-3 text-left transition-colors"
            :class="workspaceMode === option.mode ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/40'"
            @click="workspaceMode = option.mode"
          >
            <div class="text-xs font-semibold text-foreground">{{ option.label }}</div>
            <div class="mt-0.5 text-[11px] text-muted-foreground">{{ option.hint }}</div>
          </button>
        </div>
        <div v-if="workspaceMode === 'existing'" class="max-w-xs">
          <label class="text-xs font-medium text-foreground">Workspace bucket</label>
          <Select v-if="workspaceBucketOptions.length" v-model="workspaceBucket" :options="workspaceBucketOptions" placeholder="Select a bucket" class="mt-1" />
          <Input v-else v-model="workspaceBucket" class="mt-1 font-mono" placeholder="my-workspace" />
        </div>
        <p v-if="!workspaceValid" class="text-[11px] text-destructive">
          {{ workspaceMode === 'existing' ? 'Pick the bucket the run should work in.' : 'A workspace choice is required before the run starts.' }}
        </p>
        <p class="text-[11px] text-muted-foreground">
          The standard run interface carries no workspace field of its own, so a node may derive
          the workspace from its own deployment instead. The run detail reports the mode that
          was actually used.
        </p>
      </div>
    </div>

    <AdvancedPlacement />
  </div>
</template>
