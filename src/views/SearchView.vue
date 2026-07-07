<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import CatalogCard from '@/components/metadata/CatalogCard.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useMetadataSearch } from '@/composables/useMetadataSearch'
import { truncateMiddle } from '@/lib/utils'
import { Search, FileJson2, SquareTerminal, Plus, Star, AlertTriangle } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { realm, metadata, profiles, currentUser, loading, error, bootstrapped, refresh, toggleFavourite, myGroups, discoverableGroups } =
  useAruna()

// Continuity: the old ?expert=1 SPARQL workbench moved to the standalone console.
if (route.query.expert === '1') void router.replace({ name: 'query' })

const q = ref<string>((route.query.q as string) ?? '')
const profileFilter = ref<string | null>((route.query.profile as string) ?? null)
// GET /metadata/search accepts only q, limit and mode today (verified in
// aruna api/src/routes/metadata.rs MetadataSearchParams). The group filter
// is applied client-side to both browse and search results; push it down
// to the server once the backend accepts a group_id param (aruna#258).
const groupFilter = ref<string | null>((route.query.group as string) ?? null)
const favouritesOnly = ref(false)

const {
  active: searchActive,
  pending: searchPending,
  loadingMore,
  error: searchError,
  moreError,
  searched,
  results: searchResults,
  nodesQueried,
  nodesFailed,
  failedNodes,
  partial,
  capped,
  nextCursor,
  cursorEnabled,
  sentinel,
  loadMore,
  retry: retrySearch,
} = useMetadataSearch(q)
const favBusy = ref<Set<string>>(new Set())
const favError = ref<string | null>(null)
const showNewDataset = ref(false)

// One watcher builds the whole query from the refs. Spreading route.query in a
// per-ref watcher re-applies a stale value when two refs change in the same tick
// (e.g. clearFilters): vue-router only updates route.query after the async
// navigation settles, so the second replace would resurrect a param the first
// meant to drop.
watch([q, profileFilter, groupFilter], ([nq, np, ng]) =>
  router.replace({
    query: { ...route.query, q: nq || undefined, profile: np || undefined, group: ng || undefined },
  }),
)

const PAGE_SIZE = 12
const page = ref(1)
watch([q, profileFilter, groupFilter, favouritesOnly], () => {
  page.value = 1
})

// The active search query switches the whole branch, so the browse "filtering"
// state only tracks the client-side filters.
const filtering = computed(() => Boolean(profileFilter.value || groupFilter.value || favouritesOnly.value))
const favouriteIds = computed(() => currentUser.value?.favouriteMetadataIds ?? [])

const hits = computed(() =>
  metadata.value.filter((doc) => {
    if (profileFilter.value && doc.profileId !== profileFilter.value) return false
    if (groupFilter.value && doc.realmId !== groupFilter.value) return false
    if (favouritesOnly.value && !favouriteIds.value.includes(doc.ulid)) return false
    return true
  }),
)
const paged = computed(() => hits.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

// Group labels: names for groups the caller can see, honest truncated id otherwise.
const groupNames = computed(() => {
  const names = new Map<string, string>()
  for (const group of [...myGroups.value, ...discoverableGroups.value]) names.set(group.id, group.name)
  return names
})
const groupOptions = computed(() => {
  const ids = new Set<string>()
  for (const doc of metadata.value) ids.add(doc.realmId)
  for (const line of searchResults.value) ids.add(line.hit.group_id)
  return [...ids]
    .map((id) => ({ id, label: groupNames.value.get(id) ?? truncateMiddle(id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

// Search-mode client-side filtering, order-preserving (server relevance order).
const visibleResults = computed(() =>
  searchResults.value.filter((line) => {
    if (groupFilter.value && line.hit.group_id !== groupFilter.value) return false
    if (favouritesOnly.value && !favouriteIds.value.includes(line.hit.document_id)) return false
    // Profile conformance is only known for catalog-enriched hits; id-only
    // hits are counted in hiddenByProfile and surfaced honestly below.
    if (profileFilter.value && !(line.doc?.profileIds ?? []).includes(profileFilter.value)) return false
    return true
  }),
)
const hiddenByProfile = computed(() =>
  profileFilter.value ? searchResults.value.filter((line) => !line.doc).length : 0,
)

function isFavourite(id: string) {
  return favouriteIds.value.includes(id)
}

async function toggleFav(id: string) {
  if (favBusy.value.has(id)) return
  favError.value = null
  favBusy.value = new Set(favBusy.value).add(id)
  try {
    await toggleFavourite(id)
  } catch (err) {
    favError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(favBusy.value)
    next.delete(id)
    favBusy.value = next
  }
}

function clearFilters() {
  profileFilter.value = null
  groupFilter.value = null
  favouritesOnly.value = false
}
</script>

<template>
  <div>
    <PageHeader
      title="Discover"
      description="Browse the live RO-Crate metadata catalog, filter and search it, or open the SPARQL console for graph queries."
    >
      <template #actions>
        <Button :disabled="!currentUser" @click="showNewDataset = true"><Plus class="h-4 w-4" /> New metadata</Button>
        <RouterLink :to="{ name: 'query' }">
          <Button variant="outline"><SquareTerminal class="h-4 w-4" /> SPARQL console</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <div class="surface p-4">
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input v-model="q" placeholder="Search title, keywords, description, author…" class="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span class="text-muted-foreground">Profile:</span>
            <button class="chip transition-colors" :class="profileFilter === null ? 'border-primary/40 text-primary' : ''" @click="profileFilter = null">any</button>
            <button v-for="profile in profiles" :key="profile.id" class="chip transition-colors" :class="profileFilter === profile.id ? 'border-primary/40 text-primary' : ''" @click="profileFilter = profileFilter === profile.id ? null : profile.id">
              {{ profile.shortName }}
            </button>
            <span class="ml-1 text-muted-foreground">Group:</span>
            <select
              v-model="groupFilter"
              aria-label="Filter by group"
              class="h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option :value="null">any group</option>
              <option v-for="option in groupOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
            </select>
            <button v-if="currentUser" class="chip inline-flex items-center gap-1 transition-colors" :class="favouritesOnly ? 'border-amber-400/60 text-amber-600 dark:text-amber-400' : ''" @click="favouritesOnly = !favouritesOnly">
              <Star class="h-3 w-3" :fill="favouritesOnly ? 'currentColor' : 'none'" /> Favourites
            </button>
          </div>
        </div>

        <p v-if="favError" class="text-xs text-destructive">{{ favError }}</p>

        <!-- Server-backed full-text search (aruna#258): active whenever q is non-empty. -->
        <template v-if="searchActive">
          <!-- Partial-result banner: served today via nodes_queried/nodes_failed, so it is
               NOT gated behind the cursor flag. Shows even when zero hits came back. -->
          <div
            v-if="partial"
            role="status"
            class="surface flex flex-wrap items-center gap-2 border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs"
          >
            <AlertTriangle class="h-4 w-4 text-amber-600" />
            <span>Partial results — {{ nodesQueried - nodesFailed }} of {{ nodesQueried }} nodes answered; matches on failed nodes are missing.</span>
            <span v-for="node in failedNodes" :key="node" class="chip font-mono">{{ node }}</span>
            <Button variant="outline" size="sm" class="ml-auto" @click="retrySearch">Retry</Button>
          </div>

          <ErrorPanel v-if="searchError" :message="searchError" @retry="retrySearch" />

          <!-- Skeletons cover the debounce window too (!searched), so the area
               never goes blank between the filter surface and the footer. -->
          <section v-else-if="(searchPending || !searched) && !searchResults.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="n in 6" :key="n" class="h-36" />
          </section>

          <section v-else-if="visibleResults.length">
            <div class="mb-3 flex items-center gap-2">
              <FileJson2 class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Search results</h2>
              <span class="text-xs text-muted-foreground">{{ visibleResults.length }}</span>
              <span v-if="searchPending" class="text-xs text-muted-foreground">· Searching…</span>
            </div>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <template v-for="line in visibleResults" :key="line.hit.document_id">
                <CatalogCard
                  v-if="line.doc"
                  :doc="line.doc"
                  :score="line.hit.score"
                  :favourite="isFavourite(line.doc.ulid)"
                  :can-favourite="Boolean(currentUser)"
                  :favourite-busy="favBusy.has(line.doc.ulid)"
                  @toggle-favourite="toggleFav"
                />
                <!-- Honest id-only hit: not in the loaded catalog. #275's metadata detail
                     states (found/not-found/forbidden) handle unknown or private ids. -->
                <RouterLink
                  v-else
                  :to="{ name: 'metadata-detail', params: { id: line.hit.document_id } }"
                  class="surface group flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md"
                >
                  <div>
                    <h3 v-if="line.title" class="font-display text-sm font-semibold text-aruna-navy">{{ line.title }}</h3>
                    <h3 v-else class="break-all font-mono text-xs font-semibold text-aruna-navy">{{ line.hit.document_path }}</h3>
                    <p v-if="line.snippet" class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ line.snippet }}</p>
                    <p class="mt-1 text-[11px] text-muted-foreground">Not in the loaded catalog — open for details.</p>
                  </div>
                  <div class="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span class="truncate font-mono">{{ truncateMiddle(line.hit.document_id) }}</span>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <Badge variant="outline" class="text-[10px]">score {{ line.hit.score.toFixed(2) }}</Badge>
                      <span class="truncate">{{ groupNames.get(line.hit.group_id) ?? truncateMiddle(line.hit.group_id) }}</span>
                    </div>
                  </div>
                </RouterLink>
              </template>
            </div>
            <p v-if="hiddenByProfile > 0" class="mt-3 text-[11px] text-muted-foreground">
              {{ hiddenByProfile }} result(s) without catalog details are hidden by the profile filter.
            </p>

            <!-- Cursor paging (aruna#258) behind featureEnabled('searchCursor').
                 Flag off ⇒ no sentinel, no cursor param: one ≤100-hit page. -->
            <template v-if="cursorEnabled">
              <div v-if="loadingMore" class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton v-for="n in 3" :key="n" class="h-36" />
              </div>
              <div v-if="moreError" class="mt-3 flex items-center gap-2 text-xs text-destructive">
                {{ moreError }}
                <Button variant="outline" size="sm" @click="loadMore">Try again</Button>
              </div>
              <!-- IntersectionObserver sentinel (observed by useMetadataSearch). -->
              <div v-if="nextCursor && !moreError" ref="sentinel" class="h-1" aria-hidden="true" />
              <p v-else class="py-2 text-center text-[11px] text-muted-foreground">End of results.</p>
            </template>
            <p v-else-if="capped" class="py-2 text-center text-[11px] text-muted-foreground">
              Showing the first 100 matches by relevance — refine the query to narrow results.
            </p>
          </section>

          <EmptyState
            v-else
            :title="searchResults.length ? 'No matches after filters' : 'No matches'"
            :description="searchResults.length
              ? 'Results were hidden by the active group, profile or favourites filters.'
              : `No metadata in ${realm.shortName} matched “${q.trim()}”.`"
          >
            <Button v-if="searchResults.length" variant="outline" @click="clearFilters">Clear filters</Button>
          </EmptyState>
        </template>

        <!-- Browse path: client-side catalog browsing, unchanged apart from the group filter. -->
        <template v-else>
          <section v-if="!bootstrapped || (loading && !metadata.length)" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="n in 6" :key="n" class="h-36" />
          </section>

          <ErrorPanel v-else-if="error" :message="error" @retry="refresh" />

          <section v-else-if="hits.length">
            <div class="mb-3 flex items-center gap-2">
              <FileJson2 class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ filtering ? 'Matching metadata' : 'Catalog' }}</h2>
              <span class="text-xs text-muted-foreground">{{ hits.length }}</span>
            </div>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CatalogCard
                v-for="doc in paged"
                :key="doc.ulid"
                :doc="doc"
                :favourite="isFavourite(doc.ulid)"
                :can-favourite="Boolean(currentUser)"
                :favourite-busy="favBusy.has(doc.ulid)"
                @toggle-favourite="toggleFav"
              />
            </div>
            <div v-if="hits.length > PAGE_SIZE" class="surface mt-4 overflow-hidden">
              <Pagination v-model:page="page" :page-size="PAGE_SIZE" :total="hits.length" label="metadata documents" />
            </div>
          </section>

          <EmptyState
            v-else-if="filtering"
            title="No matches"
            :description="`Nothing in ${realm.shortName} matches the active filters.`"
          >
            <Button variant="outline" @click="clearFilters">Clear filters</Button>
          </EmptyState>

          <EmptyState
            v-else
            :title="`No visible metadata in ${realm.shortName}`"
            description="No RO-Crate metadata documents are visible here yet."
          >
            <Button v-if="currentUser" @click="showNewDataset = true"><Plus class="h-4 w-4" /> New metadata</Button>
          </EmptyState>
        </template>
    </div>

    <NewDatasetDialog v-model:open="showNewDataset" @created="(doc) => router.push({ name: 'metadata-detail', params: { id: doc.ulid } })" />
  </div>
</template>
