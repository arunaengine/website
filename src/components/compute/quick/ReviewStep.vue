<script setup lang="ts">
// Review of the assembled quick run; mirrors the data step's in/out structure.
import Notice from '@/components/ui/Notice.vue'
import ContainerIoSummary from '@/components/compute/ContainerIoSummary.vue'
import RunPlacementSection from '@/components/compute/RunPlacementSection.vue'
import TaskJsonPreview from '@/components/compute/TaskJsonPreview.vue'
import { injectQuickRun } from '@/composables/useQuickRun'

defineProps<{ submitError: string | null }>()

const {
  runTarget,
  realmName,
  placementLabels,
  targetProblems,
  reviewInputs,
  reviewOutputs,
  commandPreview,
  runtime,
  reuseSelectedScript,
  task,
} = injectQuickRun()
</script>

<template>
  <div class="space-y-4">
    <RunPlacementSection
      v-model:target="runTarget.target.value"
      v-model:labels="placementLabels"
      :available="runTarget.available.value"
      :local="runTarget.local.value"
      :compute="runTarget.compute.value"
      :realm-name="realmName"
      :problems="targetProblems"
    />
    <ContainerIoSummary
      :inputs="reviewInputs"
      :outputs="reviewOutputs"
      footnote="stdout and stderr are always captured."
    />
    <p class="text-xs text-muted-foreground">
      Runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in
      <code class="rounded bg-muted px-1 font-mono">{{ runtime.image }}</code>;
      {{ reuseSelectedScript ? 'the selected script object is reused without an upload.' : 'the script is uploaded when the run starts, because the backend does not accept inline script content.' }}
    </p>
    <TaskJsonPreview title="Run request" :task="task" />
    <details class="text-[11px] text-muted-foreground">
      <summary class="cursor-pointer">Technical details</summary>
      <code class="mt-1 block rounded bg-muted px-2 py-1">POST /ga4gh/tes/v1/tasks</code>
    </details>
    <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
  </div>
</template>
