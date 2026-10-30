<script setup lang="ts">
// Browse path: one page at a time, navigated by page number. The realm is never
// enumerated; favourites browse the user's own id list.
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Pagination from '@/components/ui/Pagination.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ViewToggle from '@/components/ui/ViewToggle.vue'
import DatasetCard from '@/components/datasets/DatasetCard.vue'
import DatasetTable from '@/components/datasets/DatasetTable.vue'
import { computed } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { DatasetSearchState } from '@/composables/useDatasetSearch'
import { useViewMode } from '@/composables/useViewMode'
import { FileJson2, ListChecks, Play, Plus } from '@lucide/vue'

// `skipRuns`: the run records have their own tab, so only datasets and profiles show here.
const props = defineProps<{ state: DatasetSearchState; skipRuns?: boolean }>()
const {
  browsePage,
  browseSource,
  browseBusy,
  browseStale,
  browseError,
  keptBrowse,
  browseSummary,
  favouritesOnly,
  filtering,
  hasNextPage,
  pageCount,
  hits,
  catalogSplit,
  favBusy,
} = props.state
const { goToPage, retryBrowse, clearFilters, isFavourite, toggleFav } = props.state

const router = useRouter()
const { realm, currentUser, error, bootstrapped, refresh } = useAruna()

// Each section keeps its own cards or table choice.
const views = { datasets: useViewMode('datasets'), profiles: useViewMode('profiles'), runs: useViewMode('runs') }
const sections = computed(() => [
  { key: 'datasets' as const, title: filtering.value ? 'Matching datasets' : 'Datasets', icon: FileJson2, docs: catalogSplit.value.datasets },
  { key: 'profiles' as const, title: 'Profiles', icon: ListChecks, docs: catalogSplit.value.profiles },
  { key: 'runs' as const, title: 'Process Runs', icon: Play, docs: catalogSplit.value.runs },
].filter((section) => section.docs.length && !(props.skipRuns && section.key === 'runs')))
</script>

<template>
  <!-- One placeholder until the catalog page and the session have answered;
       paging keeps the outgoing page on screen instead (browseStale). -->
  <ListSkeleton
    v-if="!bootstrapped || (browseBusy && !browseSource.length)"
    layout="cards"
    header
    :rows="6"
    label="Loading datasets"
  />

  <ErrorPanel v-else-if="browseError && !keptBrowse" :message="browseError" @retry="retryBrowse" />

  <ErrorPanel v-else-if="error && !keptBrowse" :message="error" @retry="refresh" />

  <template v-else>
    <!-- Kept documents: the failed refresh reports next to them. -->
    <div v-if="keptBrowse" class="flex flex-wrap items-center justify-center gap-2 text-xs text-destructive">
      {{ browseError }}
      <Button variant="outline" size="sm" @click="retryBrowse">Try again</Button>
    </div>

    <Spinner v-if="browseStale" show-label :label="`Loading page ${browsePage}…`" class="flex" />

    <!-- Paging keeps the outgoing page on screen; it dims and is marked
         busy so it never reads as the page that was just requested. -->
    <div
      v-if="sections.length"
      class="space-y-6 transition-opacity"
      :class="browseStale ? 'opacity-40' : ''"
      :aria-busy="browseBusy"
    >
      <section v-for="section in sections" :key="section.key">
        <div class="mb-3 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <component :is="section.icon" class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ section.title }}</h2>
            <span class="text-xs text-muted-foreground">{{ section.docs.length }}</span>
          </div>
          <ViewToggle v-model="views[section.key].value" />
        </div>
        <DatasetTable
          v-if="views[section.key].value === 'table'"
          :docs="section.docs"
          :can-favourite="Boolean(currentUser)"
          :is-favourite="isFavourite"
          :busy="favBusy"
          @toggle-favourite="toggleFav"
        />
        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DatasetCard
            v-for="doc in section.docs"
            :key="doc.ulid"
            :doc="doc"
            :favourite="isFavourite(doc.ulid)"
            :busy="favBusy.has(doc.ulid)"
            @toggle-favourite="toggleFav"
          />
        </div>
      </section>
    </div>

    <!-- Past the end: the estimate can under- or over-count, so a page
         number can outrun the listing. Never strand the user there. -->
    <EmptyState
      v-else-if="browsePage > 1 && !browseSource.length"
      title="Nothing on this page"
      :description="`Page ${browsePage} is past the end of this listing.`"
    >
      <div class="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" @click="goToPage(browsePage - 1)">Previous page</Button>
        <Button variant="outline" @click="goToPage(1)">First page</Button>
      </div>
    </EmptyState>

    <EmptyState
      v-else-if="filtering"
      title="No matches on this page"
      :description="hasNextPage
        ? 'No dataset on this page matches the active filters. Try the next page, or search by name.'
        : `Nothing in ${realm.shortName} matches the active filters.`"
    >
      <Button variant="outline" @click="clearFilters">Clear filters</Button>
    </EmptyState>

    <EmptyState
      v-else
      :title="`No visible datasets in ${realm.shortName}`"
      description="No RO-Crate datasets are visible here yet."
    >
      <Button v-if="currentUser" @click="router.push({ name: 'dataset-new' })"><Plus class="h-4 w-4" /> Create dataset</Button>
    </EmptyState>

    <!-- The page count is derived from an approximate estimate, so it is
         shown as "about"; only a short page ends the listing. -->
    <div v-if="browseSource.length || browsePage > 1 || hasNextPage" class="flex flex-col items-center gap-2">
      <p
        class="text-[11px] text-muted-foreground"
        :title="pageCount !== null && !favouritesOnly ? 'The node estimates this count per group, so the number of pages is approximate.' : undefined"
      >
        {{ browseSummary }}
      </p>
      <Pagination
        :page="browsePage"
        :page-count="pageCount"
        :has-next="hasNextPage"
        :disabled="browseBusy"
        @update:page="goToPage"
      />
    </div>
  </template>
</template>
