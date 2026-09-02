<script setup lang="ts">
// The container filesystem (inputs and captures) and the executor that runs
// against it, one coherent surface, plus resources and placement.
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import ExecutorStepsEditor from '@/components/compute/ExecutorStepsEditor.vue'
import AdvancedPlacement from '@/components/compute/custom/AdvancedPlacement.vue'
import ContainerFilesystem from '@/components/compute/custom/ContainerFilesystem.vue'
import { MAX_RESOURCE_GB, MIN_RESOURCE_GB, U32_MAX, injectCustomRun } from '@/composables/useCustomRun'
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

    <div data-tutorial="run-resources" class="space-y-3">
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

    <AdvancedPlacement />
  </div>
</template>
