<script setup lang="ts">
// The crate as a picture: the graph the editor draws, read-only. A double
// click on a node opens that entity in the page's metadata dialog.
import { defineAsyncComponent } from 'vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { Waypoints } from '@lucide/vue'

const CrateGraph = defineAsyncComponent(() => import('@/components/metadata/CrateGraph.vue'))

const props = defineProps<{ state: DatasetViewState }>()
const emit = defineEmits<{ (e: 'open', entityId: string): void }>()
const { currentCrate, crateHasEntities, loadingCrate } = props.state
</script>

<template>
  <section class="surface overflow-hidden">
    <div class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <Waypoints class="h-4 w-4 text-primary" /> Graph
      <span class="text-xs font-normal text-muted-foreground">
        Click a node to see its links, double-click to open it.
      </span>
    </div>
    <CrateGraph
      v-if="crateHasEntities"
      :source="currentCrate"
      mode="view"
      height="40rem"
      class="rounded-none border-0 shadow-none"
      @open="(id: string) => emit('open', id)"
    />
    <Skeleton v-else-if="loadingCrate" class="m-5 h-72" />
    <p v-else class="px-5 py-8 text-center text-sm text-muted-foreground">
      There is nothing to draw until the dataset's metadata has loaded.
    </p>
  </section>
</template>
