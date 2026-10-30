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
import RefreshButton from '@/components/ui/RefreshButton.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import ImportDatasetDialog from '@/components/metadata/ImportDatasetDialog.vue'
import DatasetBrowse from '@/components/datasets/DatasetBrowse.vue'
import DatasetResults from '@/components/datasets/DatasetResults.vue'
import DatasetSearch from '@/components/datasets/DatasetSearch.vue'
import SparqlWorkbench from '@/components/datasets/SparqlWorkbench.vue'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { assistantAvailable } from '@/composables/assistantState'
import { useDatasetSearch } from '@/composables/useDatasetSearch'
import { useSparqlWorkbench } from '@/composables/useSparqlWorkbench'
import { useJobs } from '@/composables/useJobs'
import { truncateMiddle } from '@/lib/utils'
import { Check, Code2, Ellipsis, Import, Plus, Sparkles, UserRoundCog } from '@lucide/vue'

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
  browseBusy,
} = state
const sparqlState = useSparqlWorkbench(documentScope)

// Run records are a type filter in the one list; an old link to their tab opens that filter.
const route = useRoute()
const router = useRouter()
if (route.query.tab === 'records') {
  void router.replace({ query: { ...route.query, tab: undefined, type: 'process-run,workflow-run' } })
}

const showImport = ref(false)

const askPrompt = computed(() =>
  q.value.trim()
    ? `Help me refine my search for "${q.value.trim()}" in this realm and summarize the results.`
    : 'Help me find datasets in this realm.',
)
// Lazy so the chat module stays out of this view's chunk.
function askAi() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => useAssistantChat().openWith(askPrompt.value, 'dataset search'))
}
</script>

<template>
  <div>
    <PageHeader title="Datasets" :docs="{ topic: 'datasets' }">
      <template #breadcrumbs>
        <template v-if="groupFilter">
          <Badge variant="outline" :title="groupFilter">
            Group: {{ groupNames.get(groupFilter) ?? truncateMiddle(groupFilter) }}
          </Badge>
        </template>
      </template>
      <template #actions>
        <Button v-if="currentUser" size="sm" as-child>
          <RouterLink :to="{ name: 'dataset-new' }"><Plus class="h-4 w-4" /> New dataset</RouterLink>
        </Button>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'presets' }"><UserRoundCog class="h-4 w-4" /> Presets</RouterLink>
        </Button>
        <!-- An import registers a NEW document, so it lives here rather than on a dataset. -->
        <Button v-if="currentUser && jobsEnabled" variant="outline" size="sm" title="Import an RO-Crate, a repository record or a dataset from another realm" @click="showImport = true">
          <Import class="h-4 w-4" /> Import
        </Button>
        <RefreshButton :busy="browseBusy" @click="state.retryBrowse" />
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="icon-sm" aria-label="More actions" title="More actions"><Ellipsis class="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-64">
            <DropdownMenuItem role="menuitemcheckbox" :aria-checked="expertMode" @click="expertMode = !expertMode">
              <Code2 class="h-3.5 w-3.5" /> SPARQL workbench
              <Check v-if="expertMode" class="ml-auto h-3.5 w-3.5" />
            </DropdownMenuItem>
            <DropdownMenuItem v-if="assistantAvailable" @click="askAi"><Sparkles class="h-3.5 w-3.5" /> Ask AI</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </PageHeader>

    <div class="w-full px-4 sm:px-6 space-y-6 py-8">
      <SparqlWorkbench v-if="expertMode" :state="sparqlState" />

      <template v-else>
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
    </div>

    <ImportDatasetDialog v-model:open="showImport" />
  </div>
</template>
