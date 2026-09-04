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
    :class="['fed lane relative grid grid-cols-[1fr_64px_1fr] items-stretch max-sm:grid-cols-1 max-sm:grid-rows-[auto_56px_auto]', `lane-${props.direction}`]"
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
  /* Nothing travels back in the to-data lane, so its link lights only once. */
  .lane-to-data :deep(.link-data-compute) { animation-name: lane-link-once; }
  .lane-to-data :deep(.link-glow-data-compute) { animation-name: lane-glow-once; }
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
/* The packet crosses in 14 % of the cycle; the run and its result take the rest. */
@keyframes lane-go { 0% { offset-distance: 0%; opacity: 0; } 2% { opacity: 1; } 13% { opacity: 1; } 14% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes lane-back { 0%, 60% { offset-distance: 0%; opacity: 0; } 62% { opacity: 1; } 73% { opacity: 1; } 74% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes lane-lbl { 0%, 2% { opacity: 0; } 4%, 9% { opacity: 1; } 11%, 100% { opacity: 0; } }
@keyframes lane-lbl-back { 0%, 62% { opacity: 0; } 64%, 69% { opacity: 1; } 71%, 100% { opacity: 0; } }
@keyframes lane-link { 0%, 14% { stroke: #57c5de; stroke-opacity: 0.95; } 18%, 58% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } 60%, 74% { stroke: #2da8e5; stroke-opacity: 0.95; } 78%, 100% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } }
@keyframes lane-glow { 0%, 14% { stroke: #57c5de; stroke-opacity: 0.3; } 18%, 58% { stroke-opacity: 0; } 60%, 74% { stroke: #2da8e5; stroke-opacity: 0.3; } 78%, 100% { stroke-opacity: 0; } }
@keyframes lane-link-once { 0%, 14% { stroke: #57c5de; stroke-opacity: 0.95; } 18%, 100% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } }
@keyframes lane-glow-once { 0%, 14% { stroke: #57c5de; stroke-opacity: 0.3; } 18%, 100% { stroke-opacity: 0; } }
@keyframes lane-bloom { 0%, 14% { opacity: 0; } 17%, 56% { opacity: 1; } 62%, 100% { opacity: 0; } }
@keyframes lane-dot { 0%, 14% { background: hsl(var(--primary) / 0.7); } 16%, 58% { background: #57c5de; box-shadow: 0 0 10px rgba(87, 197, 222, 0.8); } 62%, 100% { background: hsl(var(--primary) / 0.7); box-shadow: none; } }
@keyframes lane-ring { 0%, 14% { opacity: 0; transform: scale(0.6); } 16% { opacity: 0.9; transform: scale(0.8); } 22% { opacity: 0; transform: scale(2.2); } 100% { opacity: 0; transform: scale(2.2); } }
@keyframes lane-running { 0%, 15% { opacity: 0; transform: translateY(4px); } 17%, 56% { opacity: 1; transform: none; } 59%, 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes lane-done { 0%, 59% { opacity: 0; transform: translateY(4px); } 61%, 95% { opacity: 1; transform: none; } 98%, 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes lane-done-back { 0%, 74% { opacity: 0; transform: translateY(4px); } 76%, 97% { opacity: 1; transform: none; } 100% { opacity: 0; } }
</style>
