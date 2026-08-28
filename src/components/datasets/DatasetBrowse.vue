<script setup lang="ts">
// Browse path: one page at a time, navigated by page number. The realm is never
// enumerated; favourites browse the user's own id list.
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import DatasetCard from '@/components/datasets/DatasetCard.vue'
import { useAruna } from '@/composables/useAruna'
import type { DatasetSearchState } from '@/composables/useDatasetSearch'
import { FileJson2, ListChecks, Play, Plus } from '@lucide/vue'

const props = defineProps<{ state: DatasetSearchState }>()
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
</script>

<template>
  <section v-if="!bootstrapped || (browseBusy && !browseSource.length)" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <Skeleton v-for="n in 6" :key="n" class="h-36" />
  </section>

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
      v-if="hits.length"
      class="space-y-6 transition-opacity"
      :class="browseStale ? 'opacity-40' : ''"
      :aria-busy="browseBusy"
    >
      <section v-if="catalogSplit.datasets.length">
        <div class="mb-3 flex items-center gap-2">
          <FileJson2 class="h-4 w-4 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ filtering ? 'Matching datasets' : 'Datasets' }}</h2>
          <span class="text-xs text-muted-foreground">{{ catalogSplit.datasets.length }}</span>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DatasetCard
            v-for="doc in catalogSplit.datasets"
            :key="doc.ulid"
            :doc="doc"
            :favourite="isFavourite(doc.ulid)"
            :busy="favBusy.has(doc.ulid)"
            @toggle-favourite="toggleFav"
          />
        </div>
      </section>

      <section v-if="catalogSplit.profiles.length">
        <div class="mb-3 flex items-center gap-2">
          <ListChecks class="h-4 w-4 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Profiles</h2>
          <span class="text-xs text-muted-foreground">{{ catalogSplit.profiles.length }}</span>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DatasetCard
            v-for="doc in catalogSplit.profiles"
            :key="doc.ulid"
            :doc="doc"
            :favourite="isFavourite(doc.ulid)"
            :busy="favBusy.has(doc.ulid)"
            @toggle-favourite="toggleFav"
          />
        </div>
      </section>

      <section v-if="catalogSplit.runs.length">
        <div class="mb-3 flex items-center gap-2">
          <Play class="h-4 w-4 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Process Runs</h2>
          <span class="text-xs text-muted-foreground">{{ catalogSplit.runs.length }}</span>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DatasetCard
            v-for="doc in catalogSplit.runs"
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
