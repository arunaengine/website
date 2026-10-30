<script setup lang="ts">
// The crate as a picture: the graph the editor draws, read-only, with the kinds of entities to
// show picked above it. A double click on a node opens that entity in the page's modal.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { kindCounts, withoutKinds, type GraphKind } from '@/lib/datasetGraph'
import { Share2 } from '@lucide/vue'

const CrateGraph = defineAsyncComponent(() => import('@/components/metadata/CrateGraph.vue'))

const props = defineProps<{ state: DatasetViewState }>()
const emit = defineEmits<{ (e: 'open', entityId: string): void }>()
const { currentCrate, crateHasEntities, loadingCrate, detailId } = props.state

const hidden = ref(new Set<GraphKind>())
watch(detailId, () => (hidden.value = new Set()))
const kinds = computed(() => kindCounts(currentCrate.value))
const source = computed(() => withoutKinds(currentCrate.value, hidden.value))
function toggle(kind: GraphKind) {
  const next = new Set(hidden.value)
  if (next.has(kind)) next.delete(kind)
  else next.add(kind)
  hidden.value = next
}
</script>

<template>
  <section aria-labelledby="graph-heading">
    <SectionHeading id="graph-heading" title="Graph" :icon="Share2" info="Click a node to see its links, double-click to open it." />
    <div class="space-y-3">
      <div v-if="kinds.length > 1" class="flex flex-wrap items-center gap-1" role="group" aria-label="Kinds shown">
        <button
          v-for="entry in kinds"
          :key="entry.kind"
          type="button"
          :aria-pressed="!hidden.has(entry.kind)"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
          :class="hidden.has(entry.kind)
            ? 'border-transparent text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'
            : 'border-primary/40 bg-primary/[0.12] text-foreground'"
          @click="toggle(entry.kind)"
        >
          {{ entry.kind }} <span class="tabular-nums opacity-70">{{ entry.count }}</span>
        </button>
      </div>
      <div class="surface overflow-hidden">
        <CrateGraph
          v-if="crateHasEntities"
          :source="source"
          mode="view"
          height="40rem"
          class="rounded-none border-0 shadow-none"
          @open="(id: string) => emit('open', id)"
        />
        <Skeleton v-else-if="loadingCrate" class="m-5 h-72" />
        <p v-else class="px-5 py-8 text-center text-sm text-muted-foreground">
          There is nothing to draw until the dataset's metadata has loaded.
        </p>
      </div>
    </div>
  </section>
</template>
