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
import Input from '@/components/ui/Input.vue'
import Pagination from '@/components/ui/Pagination.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import ImportDatasetDialog from '@/components/metadata/ImportDatasetDialog.vue'
import DatasetBrowse from '@/components/datasets/DatasetBrowse.vue'
import DatasetResults from '@/components/datasets/DatasetResults.vue'
import DatasetSearch from '@/components/datasets/DatasetSearch.vue'
import RunRecordTable from '@/components/datasets/RunRecordTable.vue'
import SparqlWorkbench from '@/components/datasets/SparqlWorkbench.vue'
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { assistantAvailable } from '@/composables/assistantState'
import { useDatasetSearch } from '@/composables/useDatasetSearch'
import { useRouteTab } from '@/composables/useRouteTab'
import { useSparqlWorkbench } from '@/composables/useSparqlWorkbench'
import { useJobs } from '@/composables/useJobs'
import { pageRange } from '@/lib/objectListing'
import { truncateMiddle } from '@/lib/utils'
import { Check, Code2, Ellipsis, FileJson2, FileText, Import, Sparkles } from '@lucide/vue'

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
  catalogSplit,
  browseBusy,
  browsePage,
  pageCount,
  hasNextPage,
} = state
const sparqlState = useSparqlWorkbench(documentScope)

// Searches and dataset links land on Datasets; a link to the run records asks for that tab.
const tab = useRouteTab(['records', 'datasets'], 'datasets')
const recordFilter = ref('')
const records = computed(() => {
  const words = recordFilter.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return catalogSplit.value.runs.filter((doc) => words.every((word) => doc.title.toLowerCase().includes(word)))
})

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
        <RefreshButton :busy="browseBusy" @click="state.retryBrowse" />
        <!-- Create dataset sits in the top bar's Add menu and in the empty Datasets tab. -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="icon" aria-label="More actions" title="More actions"><Ellipsis class="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-64">
            <!-- An import registers a NEW document, so it lives here rather than on a dataset. -->
            <DropdownMenuItem v-if="currentUser && jobsEnabled" @click="showImport = true">
              <Import class="h-3.5 w-3.5" /> Import an RO-Crate or a repository record
            </DropdownMenuItem>
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

      <Tabs v-else v-model="tab">
        <TabsList>
          <TabsTrigger value="records">
            <FileText class="size-4" /><span class="max-[420px]:hidden">Run records</span><span class="min-[421px]:hidden">Records</span>
          </TabsTrigger>
          <TabsTrigger value="datasets"><FileJson2 class="size-4" /> Datasets</TabsTrigger>
        </TabsList>
      </Tabs>

      <section v-if="!expertMode && tab === 'records'" aria-labelledby="run-records-heading">
        <SectionHeading id="run-records-heading" title="Run records" :icon="FileText" :count="String(catalogSplit.runs.length)" />
        <div class="surface overflow-hidden">
          <div class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-5 py-3">
            <Input v-model="recordFilter" class="h-8 max-w-xs text-xs" placeholder="Find a record" aria-label="Find a record" />
          </div>
          <RunRecordTable v-if="records.length" :docs="records" :group-names="groupNames" />
          <p v-else-if="browseBusy" class="px-5 py-10 text-center text-sm text-muted-foreground">Loading run records…</p>
          <EmptyState v-else :title="recordFilter.trim() ? 'No record matches' : 'No run records on this page'" description="A run writes its record once it finishes." class="rounded-none border-0 shadow-none" />
          <div v-if="records.length || browsePage > 1 || hasNextPage" class="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-5 py-2 text-xs tabular-nums text-muted-foreground">
            <!-- One page holds every record only when no page follows; otherwise the page is named. -->
            <span>{{ browsePage === 1 && !hasNextPage ? pageRange(1, records.length, records.length, true) : `Page ${browsePage}` }}</span>
            <Pagination v-if="browsePage > 1 || hasNextPage" :page="browsePage" :page-count="pageCount" :has-next="hasNextPage" :disabled="browseBusy" @update:page="state.goToPage" />
          </div>
        </div>
      </section>

      <template v-else-if="!expertMode">
        <DatasetSearch
          ref="searchBox"
          v-model:query="q"
          v-model:filters="filterModel"
          :group-options="groupOptions"
          :busy="searchBusy"
        />

        <p v-if="favError" class="text-xs text-destructive">{{ favError }}</p>

        <DatasetResults v-if="searchActive" :state="state" />

        <DatasetBrowse v-else :state="state" skip-runs />
      </template>
    </div>

    <ImportDatasetDialog v-model:open="showImport" />
  </div>
</template>
