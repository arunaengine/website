<script setup lang="ts">
// Review of the assembled quick run; mirrors the data step's in/out structure.
import { computed } from 'vue'
import Notice from '@/components/ui/Notice.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
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
  task,
} = injectQuickRun()

const NODE_LABEL_KEY = 'aruna-engine.org/node'
const chosenNode = computed(() => (runTarget.local.value ? '' : placementLabels.value[NODE_LABEL_KEY] || ''))
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
    <ContainerIoSummary :inputs="reviewInputs" :outputs="reviewOutputs" />
    <p class="text-xs text-muted-foreground">
      Runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in
      <code class="rounded bg-muted px-1 font-mono">{{ runtime.image }}</code> on
      <NodeLabel v-if="chosenNode" :node-id="chosenNode" size="sm" /><template v-else>{{ runTarget.local.value ? 'this device' : 'any node' }}</template>.
    </p>
    <TaskJsonPreview title="Run request" :task="task" />
    <details class="text-[11px] text-muted-foreground">
      <summary class="cursor-pointer">Technical details</summary>
      <code class="mt-1 block rounded bg-muted px-2 py-1">POST /ga4gh/tes/v1/tasks</code>
    </details>
    <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
  </div>
</template>
