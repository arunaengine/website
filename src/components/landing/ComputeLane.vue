<script setup lang="ts">
// One direction of compute: two real nodes and what travels between them.
// "to-data" sends the job to the dataset, which runs it and keeps the result;
// "to-compute" stages the data across, runs it there and brings the result back.
import { ref } from 'vue'
import LandingNode from '@/components/landing/LandingNode.vue'
import { useGraphLinks } from '@/composables/useGraphLinks'

const props = defineProps<{ direction: 'to-data' | 'to-compute' }>()

const root = ref<HTMLElement | null>(null)
useGraphLinks(root, ['data-compute'])
</script>

<template>
  <div
    ref="root"
    :class="['fed lane relative grid grid-cols-[1fr_72px_1fr] items-center', `lane-${props.direction}`]"
    role="img"
    :aria-label="props.direction === 'to-data'
      ? 'A compute job travels from the Kubernetes cluster to the research institute, runs next to the dataset, and the result is stored there.'
      : 'The dataset is staged from the research institute to the Kubernetes cluster, the job runs there, and the result travels back.'"
  >
    <svg data-links class="absolute inset-0 block h-full w-full overflow-visible" aria-hidden="true" />
    <LandingNode id="data" label="Research institute" tag="Institute" meta="Coral Reef Survey 2026" states class="node-data" />
    <div aria-hidden="true" />
    <LandingNode id="compute" label="Kubernetes cluster" tag="K8s" meta="executors ready" states class="node-compute" />
    <template v-if="props.direction === 'to-data'">
      <span class="tail pt-go" data-from="compute" data-to="data" aria-hidden="true" />
      <span class="pt pt-go" data-from="compute" data-to="data" aria-hidden="true"><b>job</b></span>
    </template>
    <template v-else>
      <span class="tail pt-go" data-from="data" data-to="compute" aria-hidden="true" />
      <span class="pt pt-go" data-from="data" data-to="compute" aria-hidden="true"><b>data</b></span>
      <span class="tail pt-back pt-result" data-from="compute" data-to="data" aria-hidden="true" />
      <span class="pt pt-back pt-result" data-from="compute" data-to="data" aria-hidden="true"><b>result</b></span>
    </template>
  </div>
</template>

<style scoped>
.lane { --cycle: 12s; }
.lane :deep(.landing-node) { position: relative; }
/* At rest: the first packet on its way and the path lit. */
.lane .pt-go { opacity: 1; offset-distance: 50%; }
.lane :deep(.link-data-compute) { stroke: var(--aqua); stroke-opacity: 0.95; }
.lane :deep(.link-glow-data-compute) { stroke-opacity: 0.3; }

@media (prefers-reduced-motion: no-preference) {
  .lane .pt-go { animation: lane-go var(--cycle) linear infinite; }
  .lane .pt-go b { animation: lane-lbl var(--cycle) linear infinite; }
  .lane .pt-back { animation: lane-back var(--cycle) linear infinite; }
  .lane .pt-back b { animation: lane-lbl-back var(--cycle) linear infinite; }
  .lane :deep(.link-data-compute) { animation: lane-link var(--cycle) linear infinite; }
  .lane :deep(.link-glow-data-compute) { animation: lane-glow var(--cycle) linear infinite; }
  .lane-to-data :deep(.node-data)::before,
  .lane-to-compute :deep(.node-compute)::before { animation: lane-bloom var(--cycle) linear infinite; }
  .lane-to-data :deep(.node-data .node-dot),
  .lane-to-compute :deep(.node-compute .node-dot) { animation: lane-dot var(--cycle) linear infinite; }
  .lane-to-data :deep(.node-data .node-dot)::after,
  .lane-to-compute :deep(.node-compute .node-dot)::after { animation: lane-ring var(--cycle) linear infinite; }
  .lane-to-data :deep(.node-data .st-running),
  .lane-to-compute :deep(.node-compute .st-running) { animation: lane-running var(--cycle) linear infinite; }
  .lane-to-data :deep(.node-data .st-done) { animation: lane-done var(--cycle) linear infinite; }
  .lane-to-compute :deep(.node-data .st-done) { animation: lane-done-back var(--cycle) linear infinite; }
}
/* The packet takes a third of the cycle; the run and its result take the rest. */
@keyframes lane-go { 0% { offset-distance: 0%; opacity: 0; } 3% { opacity: 1; } 30% { opacity: 1; } 33% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes lane-back { 0%, 60% { offset-distance: 0%; opacity: 0; } 63% { opacity: 1; } 87% { opacity: 1; } 90% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes lane-lbl { 0%, 4% { opacity: 0; } 7%, 27% { opacity: 1; } 30%, 100% { opacity: 0; } }
@keyframes lane-lbl-back { 0%, 64% { opacity: 0; } 67%, 84% { opacity: 1; } 87%, 100% { opacity: 0; } }
@keyframes lane-link { 0%, 33% { stroke: #57c5de; stroke-opacity: 0.95; } 38%, 58% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } 62%, 90% { stroke: #2da8e5; stroke-opacity: 0.95; } 95%, 100% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } }
@keyframes lane-glow { 0%, 33% { stroke: #57c5de; stroke-opacity: 0.3; } 38%, 58% { stroke-opacity: 0; } 62%, 90% { stroke: #2da8e5; stroke-opacity: 0.3; } 95%, 100% { stroke-opacity: 0; } }
@keyframes lane-bloom { 0%, 32% { opacity: 0; } 36%, 58% { opacity: 1; } 66%, 100% { opacity: 0; } }
@keyframes lane-dot { 0%, 32% { background: hsl(var(--primary) / 0.7); } 35%, 60% { background: #57c5de; box-shadow: 0 0 10px rgba(87, 197, 222, 0.8); } 66%, 100% { background: hsl(var(--primary) / 0.7); box-shadow: none; } }
@keyframes lane-ring { 0%, 32% { opacity: 0; transform: scale(0.6); } 34% { opacity: 0.9; transform: scale(0.8); } 44% { opacity: 0; transform: scale(2.6); } 100% { opacity: 0; transform: scale(2.6); } }
@keyframes lane-running { 0%, 34% { opacity: 0; transform: translateY(4px); } 37%, 57% { opacity: 1; transform: none; } 60%, 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes lane-done { 0%, 60% { opacity: 0; transform: translateY(4px); } 63%, 94% { opacity: 1; transform: none; } 97%, 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes lane-done-back { 0%, 89% { opacity: 0; transform: translateY(4px); } 92%, 99% { opacity: 1; transform: none; } 100% { opacity: 0; } }
</style>
