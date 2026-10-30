<script setup lang="ts">
// Details: the dataset's technical facts in Aruna, then its persistent id, Git repository, storage
// location and the SPARQL query with this dataset fixed.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import PersistentIdSection from '@/components/metadata/PersistentIdSection.vue'
import DatasetGitRow from '@/components/metadata/view/DatasetGitRow.vue'
import DatasetStorageRow from '@/components/metadata/view/DatasetStorageRow.vue'
import { useAruna } from '@/composables/useAruna'
import type { DatasetViewState } from '@/composables/useDatasetView'
import type { RepositoryLink, StorageLocation } from '@/lib/api'
import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'
import { formatDateTime, truncateMiddle } from '@/lib/utils'
import { Code2, List } from '@lucide/vue'

const props = defineProps<{ state: DatasetViewState; links: RepositoryLink[] | null; changed: StorageLocation | null }>()
const emit = defineEmits<{ (e: 'changed', value: StorageLocation): void }>()
const { detailId, fetchedSummary, currentCrate, canWrite } = props.state
const { currentUser, myGroups } = useAruna()

const groupId = computed(() => fetchedSummary.value?.group_id ?? '')
const group = computed(() => myGroups.value.find((entry) => entry.id === groupId.value))
const version = computed(() => {
  const graph = crateGraph(currentCrate.value)
  const root = graph.find((entity) => entity['@id'] === crateRootId(currentCrate.value))
  return stringProp(root?.version) ?? ''
})
const pidSection = ref<InstanceType<typeof PersistentIdSection> | null>(null)
defineExpose({ reload: () => pidSection.value?.reload() })
</script>

<template>
  <section aria-labelledby="details-heading">
    <SectionHeading id="details-heading" title="Details" :icon="List" />
    <div class="surface overflow-hidden">
      <dl class="grid gap-x-6 gap-y-2.5 p-5 text-sm sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)]">
        <dt class="text-muted-foreground">Dataset ID</dt>
        <dd class="flex min-w-0 items-center gap-1"><code class="min-w-0 break-all font-mono text-xs">{{ detailId }}</code><CopyButton :value="detailId" label="Copy the dataset ID" /></dd>
        <template v-if="version">
          <dt class="text-muted-foreground">Version</dt>
          <dd>{{ version }}</dd>
        </template>
        <template v-if="groupId">
          <dt class="text-muted-foreground">Group</dt>
          <dd>
            <RouterLink v-if="group" :to="{ name: 'group', params: { id: groupId } }" class="underline decoration-border underline-offset-4 hover:decoration-foreground">{{ group.name }}</RouterLink>
            <span v-else :title="groupId">{{ truncateMiddle(groupId) }}</span>
          </dd>
        </template>
        <template v-if="fetchedSummary">
          <dt class="text-muted-foreground">Created</dt>
          <dd class="tabular-nums">{{ formatDateTime(fetchedSummary.created_at) }}</dd>
          <dt class="text-muted-foreground">Updated</dt>
          <dd class="tabular-nums">{{ formatDateTime(fetchedSummary.updated_at) }}</dd>
        </template>
        <dt class="text-muted-foreground">Query</dt>
        <dd>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'datasets', query: { expert: '1', document: detailId } }"><Code2 class="h-3.5 w-3.5" /> Query this dataset</RouterLink>
          </Button>
        </dd>
      </dl>
      <div v-if="fetchedSummary" class="border-t border-border px-5 py-4">
        <PersistentIdSection ref="pidSection" :document-id="detailId" :is-public="fetchedSummary.public" :links="links" />
      </div>
      <DatasetGitRow v-if="currentUser" :document-id="detailId" :group-id="fetchedSummary?.group_id" :changed="changed" />
      <DatasetStorageRow
        v-if="currentUser && fetchedSummary"
        :document-id="detailId"
        :group-id="fetchedSummary.group_id"
        :can-write="canWrite"
        @changed="(value: StorageLocation) => emit('changed', value)"
      />
    </div>
  </section>
</template>
