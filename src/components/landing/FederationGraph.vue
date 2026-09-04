<script setup lang="ts">
// Three independent nodes as peers: a job travels to the institute's dataset
// and runs there, then data travels to the cluster and its result comes back
// to the local machine. The links are measured from the cards; CSS moves the
// packets and lights the path in use.
import { ref } from 'vue'
import LandingNode from '@/components/landing/LandingNode.vue'
import { useGraphLinks } from '@/composables/useGraphLinks'

const root = ref<HTMLElement | null>(null)
useGraphLinks(root, ['local-institute', 'k8s-institute', 'k8s-local'])

const packets = [
  { kind: 'job', from: 'k8s', to: 'institute', label: 'job' },
  { kind: 'res1', from: 'institute', to: 'local', label: 'result' },
  { kind: 'data', from: 'institute', to: 'k8s', label: 'data' },
  { kind: 'res2', from: 'k8s', to: 'local', label: 'result' },
] as const
</script>

<template>
  <div
    ref="root"
    class="fed graph relative h-[360px] w-full sm:h-[340px]"
    role="img"
    aria-label="Three independent Aruna nodes, a local machine, a research institute and a Kubernetes cluster, connected as peers. A compute job moves toward the dataset and runs there, then data moves toward compute and the result returns."
  >
    <svg data-links class="absolute inset-0 block h-full w-full overflow-visible" aria-hidden="true" />
    <LandingNode id="local" label="Local machine" tag="Local" meta="portal open" states class="node-local" />
    <LandingNode id="institute" label="Research institute" tag="Institute" meta="Coral Reef Survey 2026" states class="node-institute" />
    <LandingNode id="k8s" label="Kubernetes cluster" tag="K8s" meta="executors ready" states class="node-k8s" />
    <template v-for="packet in packets" :key="packet.kind">
      <span :class="['tail', `pt-${packet.kind}`, packet.label === 'result' && 'pt-result']" :data-from="packet.from" :data-to="packet.to" aria-hidden="true" />
      <span :class="['pt', `pt-${packet.kind}`, packet.label === 'result' && 'pt-result']" :data-from="packet.from" :data-to="packet.to" aria-hidden="true"><b>{{ packet.label }}</b></span>
    </template>
  </div>
</template>

<style scoped>
.graph { --cycle: 16s; }
.graph :deep(.landing-node) { position: absolute; width: 46%; max-width: 280px; }
/* A triangle: the local machine on the left, the two remote nodes stacked on
   the right, so every link is long enough for a packet, its tail and label. */
.graph :deep(.node-local) { left: 0; top: 50%; transform: translateY(-50%); }
.graph :deep(.node-institute) { right: 0; top: 0; }
.graph :deep(.node-k8s) { right: 0; bottom: 0; }
/* At rest the compute-to-data path is lit, with the job on its way. */
.graph .pt-job { opacity: 1; offset-distance: 55%; }
.graph :deep(.link-k8s-institute) { stroke: var(--aqua); stroke-opacity: 0.95; }
.graph :deep(.link-glow-k8s-institute) { stroke-opacity: 0.3; }

@media (prefers-reduced-motion: no-preference) {
  .graph .pt-job { animation: pt-job var(--cycle) linear infinite; }
  .graph .pt-res1 { animation: pt-res1 var(--cycle) linear infinite; }
  .graph .pt-data { animation: pt-data var(--cycle) linear infinite; }
  .graph .pt-res2 { animation: pt-res2 var(--cycle) linear infinite; }
  .graph .pt-job b { animation: lbl-job var(--cycle) linear infinite; }
  .graph .pt-res1 b { animation: lbl-res1 var(--cycle) linear infinite; }
  .graph .pt-data b { animation: lbl-data var(--cycle) linear infinite; }
  .graph .pt-res2 b { animation: lbl-res2 var(--cycle) linear infinite; }
  .graph :deep(.link-k8s-institute) { animation: link-a var(--cycle) linear infinite; }
  .graph :deep(.link-glow-k8s-institute) { animation: glow-a var(--cycle) linear infinite; }
  .graph :deep(.link-local-institute) { animation: link-b var(--cycle) linear infinite; }
  .graph :deep(.link-glow-local-institute) { animation: glow-b var(--cycle) linear infinite; }
  .graph :deep(.link-k8s-local) { animation: link-c var(--cycle) linear infinite; }
  .graph :deep(.link-glow-k8s-local) { animation: glow-c var(--cycle) linear infinite; }
  .graph :deep(.node-institute)::before { animation: bloom-inst var(--cycle) linear infinite; }
  .graph :deep(.node-k8s)::before { animation: bloom-k8s var(--cycle) linear infinite; }
  .graph :deep(.node-institute .node-dot) { animation: dot-inst var(--cycle) linear infinite; }
  .graph :deep(.node-institute .node-dot)::after { animation: ring-inst var(--cycle) linear infinite; }
  .graph :deep(.node-k8s .node-dot) { animation: dot-k8s var(--cycle) linear infinite; }
  .graph :deep(.node-k8s .node-dot)::after { animation: ring-k8s var(--cycle) linear infinite; }
  .graph :deep(.node-institute .st-running) { animation: run-inst var(--cycle) linear infinite; }
  .graph :deep(.node-institute .st-done) { animation: done-inst var(--cycle) linear infinite; }
  .graph :deep(.node-k8s .st-running) { animation: run-k8s var(--cycle) linear infinite; }
  .graph :deep(.node-local .st-done) { animation: done-local var(--cycle) linear infinite; }
}
/* Cycle: job 0-19, run at the institute 20-30, result 30-46, data 52-70, run at k8s 71-80, result 80-96. */
@keyframes pt-job { 0% { offset-distance: 0%; opacity: 0; } 1.5% { opacity: 1; } 17.5% { opacity: 1; } 19% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes pt-res1 { 0%, 30% { offset-distance: 0%; opacity: 0; } 31.5% { opacity: 1; } 44.5% { opacity: 1; } 46% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes pt-data { 0%, 52% { offset-distance: 0%; opacity: 0; } 53.5% { opacity: 1; } 68.5% { opacity: 1; } 70% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes pt-res2 { 0%, 80% { offset-distance: 0%; opacity: 0; } 81.5% { opacity: 1; } 94.5% { opacity: 1; } 96% { offset-distance: 100%; opacity: 0; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes lbl-job { 0%, 2% { opacity: 0; } 3.5%, 12% { opacity: 1; } 14.5%, 100% { opacity: 0; } }
@keyframes lbl-res1 { 0%, 32% { opacity: 0; } 33.5%, 40% { opacity: 1; } 42%, 100% { opacity: 0; } }
@keyframes lbl-data { 0%, 54% { opacity: 0; } 55.5%, 64% { opacity: 1; } 66.5%, 100% { opacity: 0; } }
@keyframes lbl-res2 { 0%, 82% { opacity: 0; } 83.5%, 90% { opacity: 1; } 92.5%, 100% { opacity: 0; } }
@keyframes link-a { 0%, 20% { stroke: #57c5de; stroke-opacity: 0.95; } 26%, 50% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } 53%, 71% { stroke: #57c5de; stroke-opacity: 0.95; } 77%, 100% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } }
@keyframes glow-a { 0%, 20% { stroke: #57c5de; stroke-opacity: 0.3; } 26%, 50% { stroke-opacity: 0; } 53%, 71% { stroke: #57c5de; stroke-opacity: 0.3; } 77%, 100% { stroke-opacity: 0; } }
@keyframes link-b { 0%, 28% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } 31%, 46% { stroke: #2da8e5; stroke-opacity: 0.95; } 52%, 100% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } }
@keyframes glow-b { 0%, 28% { stroke-opacity: 0; } 31%, 46% { stroke: #2da8e5; stroke-opacity: 0.3; } 52%, 100% { stroke-opacity: 0; } }
@keyframes link-c { 0%, 78% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } 81%, 96% { stroke: #2da8e5; stroke-opacity: 0.95; } 100% { stroke: hsl(var(--primary)); stroke-opacity: 0.4; } }
@keyframes glow-c { 0%, 78% { stroke-opacity: 0; } 81%, 96% { stroke: #2da8e5; stroke-opacity: 0.3; } 100% { stroke-opacity: 0; } }
@keyframes bloom-inst { 0%, 17% { opacity: 0; } 20%, 32% { opacity: 1; } 40%, 100% { opacity: 0; } }
@keyframes bloom-k8s { 0%, 68% { opacity: 0; } 71%, 82% { opacity: 1; } 90%, 100% { opacity: 0; } }
@keyframes dot-inst { 0%, 18% { background: hsl(var(--primary) / 0.7); } 20%, 32% { background: #57c5de; box-shadow: 0 0 10px rgba(87, 197, 222, 0.8); } 40%, 100% { background: hsl(var(--primary) / 0.7); box-shadow: none; } }
@keyframes ring-inst { 0%, 18% { opacity: 0; transform: scale(0.6); } 20% { opacity: 0.9; transform: scale(0.8); } 25% { opacity: 0; transform: scale(2.2); } 100% { opacity: 0; transform: scale(2.2); } }
@keyframes dot-k8s { 0%, 69% { background: hsl(var(--primary) / 0.7); } 71%, 82% { background: #57c5de; box-shadow: 0 0 10px rgba(87, 197, 222, 0.8); } 90%, 100% { background: hsl(var(--primary) / 0.7); box-shadow: none; } }
@keyframes ring-k8s { 0%, 69% { opacity: 0; transform: scale(0.6); } 71% { opacity: 0.9; transform: scale(0.8); } 76% { opacity: 0; transform: scale(2.2); } 100% { opacity: 0; transform: scale(2.2); } }
@keyframes run-inst { 0%, 19% { opacity: 0; transform: translateY(4px); } 21%, 29% { opacity: 1; transform: none; } 31%, 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes done-inst { 0%, 30% { opacity: 0; transform: translateY(4px); } 32%, 50% { opacity: 1; transform: none; } 52%, 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes run-k8s { 0%, 70% { opacity: 0; transform: translateY(4px); } 72%, 79% { opacity: 1; transform: none; } 81%, 100% { opacity: 0; transform: translateY(-4px); } }
@keyframes done-local { 0%, 5% { opacity: 1; transform: none; } 7%, 45% { opacity: 0; transform: translateY(4px); } 47%, 58% { opacity: 1; transform: none; } 60%, 96% { opacity: 0; transform: translateY(4px); } 97%, 100% { opacity: 1; transform: none; } }

@media (max-width: 639px) {
  .graph :deep(.landing-node) { width: 72%; max-width: none; }
  .graph :deep(.node-local) { left: 0; top: 0; transform: none; }
  .graph :deep(.node-institute) { right: 0; top: 33%; }
  .graph :deep(.node-k8s) { left: 0; bottom: 0; }
}
</style>
