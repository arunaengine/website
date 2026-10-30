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
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{
  state: DatasetViewState
  documentId: string
  title: string
  record?: { files: number; path: string; to: RouteLocationRaw | null; runId?: string; where?: string } | null
}>()
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
    <ProvenanceView v-if="crateHasEntities" :start="start" :record="record" />
    <template v-else>
      <SectionHeading id="provenance-heading" title="Where it came from" :icon="GitBranch" />
      <div class="surface px-5 py-4">
        <Skeleton v-if="loadingCrate" class="h-40" />
        <p v-else class="py-6 text-center text-sm text-muted-foreground">There is nothing to follow until the dataset's metadata has loaded.</p>
      </div>
    </template>
  </section>
</template>
