<script setup lang="ts">
// Where the dataset's files came from: the provenance view, starting at each file part that
// records its exact version.
import { computed } from 'vue'
import ProvenanceView from '@/components/data/ProvenanceView.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { GitBranch } from '@lucide/vue'
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
  <section aria-labelledby="provenance-heading">
    <SectionHeading id="provenance-heading" title="Where it came from" :icon="GitBranch" />
    <div class="surface space-y-3 px-5 py-4">
      <ProvenanceView v-if="crateHasEntities" :start="start" />
      <Skeleton v-else-if="loadingCrate" class="h-40" />
      <p v-else class="py-6 text-center text-sm text-muted-foreground">There is nothing to follow until the dataset's metadata has loaded.</p>
    </div>
  </section>
</template>
