<script lang="ts">
export {
  datasetPurposeLabel,
  datasetPurposeMatches,
  datasetPurposeOf,
  type DatasetPurpose,
} from '@/lib/datasetPurpose'
</script>

<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import CrateTransferDialog from '@/components/metadata/CrateTransferDialog.vue'
import DatasetBrowse from '@/components/datasets/DatasetBrowse.vue'
import DatasetResults from '@/components/datasets/DatasetResults.vue'
import DatasetSearch from '@/components/datasets/DatasetSearch.vue'
import SparqlWorkbench from '@/components/datasets/SparqlWorkbench.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useDatasetSearch } from '@/composables/useDatasetSearch'
import { useSparqlWorkbench } from '@/composables/useSparqlWorkbench'
import { useJobs } from '@/composables/useJobs'
import { truncateMiddle } from '@/lib/utils'
import { Code2, FileArchive, Plus } from '@lucide/vue'

const router = useRouter()
const { currentUser } = useAruna()
const { jobsEnabled } = useJobs()

const searchBox = ref<{ focus: () => void } | null>(null)
const state = useDatasetSearch(searchBox)
const {
  q,
  documentScope,
  expertMode,
  filterModel,
  groupFilter,
  groupNames,
  groupOptions,
  favError,
  searchActive,
  searchBusy,
} = state
const sparqlState = useSparqlWorkbench(documentScope)

const showCrateImport = ref(false)

const askPrompt = computed(() =>
  q.value.trim()
    ? `Help me refine my search for "${q.value.trim()}" in this realm and summarize the results.`
    : 'Help me find datasets in this realm.',
)
</script>

<template>
  <div>
    <PageHeader
      title="Datasets"
      description="Browse every visible RO-Crate by dataset purpose, search across supported resource kinds, or use the SPARQL workbench."
    >
      <template #breadcrumbs>
        <template v-if="groupFilter">
          <span>·</span>
          <Badge variant="outline" :title="groupFilter">
            Group: {{ groupNames.get(groupFilter) ?? truncateMiddle(groupFilter) }}
          </Badge>
        </template>
        <span>·</span>
        <span>What is this?</span>
        <RouterLink
          :to="{ name: 'docs', params: { topic: 'datasets' } }"
          class="font-medium text-primary hover:underline"
        >Learn more</RouterLink>
      </template>
      <template #actions>
        <AskAiButton :prompt="askPrompt" size="default" />
        <Button :disabled="!currentUser" @click="router.push({ name: 'dataset-new' })"><Plus class="h-4 w-4" /> Create dataset</Button>
        <!-- Importing an archive registers a NEW document, so it lives here next
             to Create dataset rather than on a single dataset's page. -->
        <Button
          v-if="currentUser && jobsEnabled"
          variant="outline"
          title="Upload an RO-Crate zip or eln archive and register it as a new dataset"
          @click="showCrateImport = true"
        >
          <FileArchive class="h-4 w-4" /> Import RO-Crate dataset
        </Button>
        <div class="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
          <Code2 class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-xs text-foreground/80">SPARQL</span>
          <Switch :checked="expertMode" @update:checked="(v: boolean) => (expertMode = v)" />
        </div>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="!expertMode">
        <DatasetSearch
          ref="searchBox"
          v-model:query="q"
          v-model:filters="filterModel"
          :group-options="groupOptions"
          :busy="searchBusy"
        />

        <p v-if="favError" class="text-xs text-destructive">{{ favError }}</p>

        <DatasetResults v-if="searchActive" :state="state" />

        <DatasetBrowse v-else :state="state" />
      </template>

      <SparqlWorkbench v-else :state="sparqlState" />
    </div>

    <CrateTransferDialog v-model:open="showCrateImport" mode="import" />
  </div>
</template>
