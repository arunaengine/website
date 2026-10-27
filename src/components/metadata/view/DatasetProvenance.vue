<script setup lang="ts">
// Where the dataset's files came from: the provenance view, starting at each file part that
// records its exact version.
import { computed } from 'vue'
import ProvenanceView from '@/components/data/ProvenanceView.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import type { DatasetViewState } from '@/composables/useDatasetView'
import type { ProvenanceStart } from '@/lib/provenance'

const props = defineProps<{ state: DatasetViewState; documentId: string; title: string }>()
const { currentCrate, crateHasEntities, loadingCrate } = props.state

// One start per crate, so a re-render keeps what the view has read.
const start = computed<ProvenanceStart>(() => ({
  kind: 'dataset',
  documentId: props.documentId,
  title: props.title,
  crate: currentCrate.value,
}))
</script>

<template>
  <section class="surface space-y-3 px-5 py-4">
    <h2 class="text-sm font-medium text-foreground">Provenance</h2>
    <ProvenanceView v-if="crateHasEntities" :start="start" />
    <Skeleton v-else-if="loadingCrate" class="h-40" />
    <p v-else class="py-6 text-center text-sm text-muted-foreground">There is nothing to follow until the dataset's metadata has loaded.</p>
  </section>
</template>
