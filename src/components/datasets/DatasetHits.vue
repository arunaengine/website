<script setup lang="ts">
// Dataset hits for the active query, and the cursor pager that walks them.
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import DatasetCard from '@/components/datasets/DatasetCard.vue'
import { useAruna } from '@/composables/useAruna'
import type { DatasetSearchState } from '@/composables/useDatasetSearch'
import { truncateMiddle } from '@/lib/utils'
import { FileJson2 } from '@lucide/vue'

const props = defineProps<{ state: DatasetSearchState }>()
const {
  keptResults,
  searchError,
  searchPending,
  searchPaging,
  searched,
  searchResults,
  visibleResults,
  searchBusy,
  searchStale,
  textQuery,
  hiddenByProfile,
  cursorEnabled,
  capped,
  truncated,
  searchDepthCapped,
  searchPage,
  searchPageCount,
  searchHasNext,
  searchPageError,
  searchRestarting,
  searchSummary,
  groupNames,
  favBusy,
} = props.state
const { retrySearch, showSearchPage, clearFilters, isFavourite, toggleFav } = props.state

const { realm } = useAruna()
</script>

<template>
  <div v-if="keptResults" class="flex flex-wrap items-center justify-center gap-2 text-xs text-destructive">
    {{ searchError }}
    <Button variant="outline" size="sm" @click="retrySearch">Try again</Button>
  </div>

  <ErrorPanel v-if="searchError && !keptResults" :message="searchError" @retry="retrySearch" />

  <!-- Skeletons cover the debounce window too (!searched), and the walk
       to a page past the cached ones, so the area never goes blank. -->
  <section v-else-if="(searchPending || searchPaging || !searched) && !searchResults.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <Skeleton v-for="n in 6" :key="n" class="h-36" />
  </section>

  <section v-else-if="visibleResults.length" :aria-busy="searchBusy">
    <div class="mb-3 flex items-center gap-2">
      <FileJson2 class="h-4 w-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ textQuery ? 'Dataset results' : 'Datasets with this profile' }}</h2>
      <span class="text-xs text-muted-foreground">{{ visibleResults.length }}</span>
      <span v-if="searchStale" class="text-xs text-muted-foreground">· previous results</span>
    </div>
    <div class="grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3" :class="searchStale ? 'opacity-40' : ''">
      <template v-for="line in visibleResults" :key="line.hit.document_id">
        <DatasetCard
          v-if="line.doc"
          :doc="line.doc"
          purpose
          :score="textQuery ? line.hit.score : undefined"
          :favourite="isFavourite(line.doc.ulid)"
          :busy="favBusy.has(line.doc.ulid)"
          @toggle-favourite="toggleFav"
        />
        <!-- Server-side hit outside the loaded pages: title and snippet
             come from the answering node, the rest opens on the detail
             page (which handles unknown or private ids honestly). -->
        <RouterLink
          v-else
          :to="{ name: 'dataset', params: { id: line.hit.document_id } }"
          class="surface group flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md"
        >
          <span class="w-fit text-[10px] uppercase text-muted-foreground">Purpose unknown</span>
          <div>
            <h3 v-if="line.title" class="font-display text-sm font-semibold text-aruna-navy">{{ line.title }}</h3>
            <h3 v-else class="break-all font-mono text-xs font-semibold text-aruna-navy">{{ line.hit.document_path }}</h3>
            <p v-if="line.snippet" class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ line.snippet }}</p>
          </div>
          <div class="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span class="truncate font-mono">{{ truncateMiddle(line.hit.document_id) }}</span>
            <div class="flex shrink-0 items-center gap-1.5">
              <Badge v-if="textQuery" variant="outline" size="sm">score {{ line.hit.score.toFixed(2) }}</Badge>
              <span class="truncate">{{ groupNames.get(line.hit.group_id) ?? truncateMiddle(line.hit.group_id) }}</span>
            </div>
          </div>
        </RouterLink>
      </template>
    </div>
    <p v-if="hiddenByProfile > 0" class="mt-3 text-[11px] text-muted-foreground">
      {{ hiddenByProfile }} result(s) without loaded details are hidden by the profile filter.
    </p>
  </section>

  <EmptyState
    v-else-if="!cursorEnabled || (searched && !searchPending && !searchPaging)"
    :title="searchResults.length ? 'No matches after filters' : 'No matches'"
    :description="searchResults.length
      ? 'Results were hidden by the active purpose, group, profile, or favourites filters.'
      : textQuery
        ? `No dataset in ${realm.shortName} matched “${textQuery}”.`
        : `No dataset in ${realm.shortName} conforms to this profile.`"
  >
    <Button v-if="searchResults.length" variant="outline" @click="clearFilters">Clear filters</Button>
  </EmptyState>

  <!-- Paging stays outside the visible-results branch so filters cannot
       strand matches on later server pages: a fully filtered page still
       offers Next. Numbers cover the pages reached so far only. -->
  <!-- Kept results still carry the cursor of the page they came from,
       so a failed refresh does not take the pager with it. -->
  <template v-if="cursorEnabled && searched && (!searchError || keptResults)">
    <div v-if="searchPageError" class="mt-3 flex items-center justify-center gap-2 text-xs text-destructive">
      {{ searchPageError }}
      <Button variant="outline" size="sm" @click="showSearchPage(searchPage + 1)">Try again</Button>
    </div>
    <div class="mt-4 flex flex-col items-center gap-2">
      <p
        v-if="searchPageCount > 1 || searchHasNext"
        class="text-[11px] text-muted-foreground"
        title="Search pages are walked with an opaque cursor and the node counts no matches, so there is no page total."
      >
        {{ searchSummary }}
      </p>
      <!-- A rejected cursor forces a refetch from page one, so every
           stored cursor is dead until it lands. -->
      <Pagination
        :page="searchPage"
        :page-count="searchPageCount"
        :has-next="searchHasNext"
        :disabled="searchRestarting"
        @update:page="showSearchPage"
      />
      <p v-if="!searchHasNext && !searchPaging && !searchRestarting && !searchPageError" class="py-2 text-center text-[11px] text-muted-foreground">
        {{ truncated || searchDepthCapped
          ? 'End of the first results, refine the query to reach matches past the node depth cap.'
          : 'End of results.' }}
      </p>
    </div>
  </template>
  <p v-else-if="!cursorEnabled && capped" class="py-2 text-center text-[11px] text-muted-foreground">
    Showing the first 100 matches by relevance, refine the query to narrow results.
  </p>
</template>
