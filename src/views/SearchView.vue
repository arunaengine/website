<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
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
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useDebounceFn } from '@vueuse/core'
import { featureEnabled } from '@/lib/config'
import { shortUserId, truncateMiddle } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { conformsToWorkflowRun } from '@/lib/profiles/builtinProfiles'
import { parseRunCrate } from '@/lib/runCrate'
import { Search, FileJson2, Boxes, Code2, Play, Plus, Star, AlertTriangle, Users, UserRound, Workflow } from '@lucide/vue'
import type { MetadataDoc, SparqlResult } from '@/data/types'
import type { BucketSearchHit, UserSearchHit } from '@/lib/api'
import type { RouteLocationRaw } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { realm, metadata, profiles, currentUser, loading, error, bootstrapped, refresh, runSparql, toggleFavourite, myGroups, discoverableGroups, searchUsers, searchUnified } =
  useAruna()
const { displayName: nodeDisplayName, isLocalNode } = useRealmNodes()

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function queryFilter(value: unknown): string | null {
  return queryString(value) || null
}

const q = ref(queryString(route.query.q))
const profileFilter = ref<string | null>(queryFilter(route.query.profile))
// Search push-down: the group filter maps to the server group_id and the profile
// filter to conforms_to when it resolves to a local profile IRI. Browse (no
// active query) still filters the loaded catalog client-side.
const groupFilter = ref<string | null>(queryFilter(route.query.group))
const favouritesOnly = ref(false)

// A local profile carries the conformsTo IRI that documents reference; a filter
// that resolves to one is pushed to the server, otherwise it stays client-side.
const conformsToIri = computed<string | null>(() => {
  if (!profileFilter.value) return null
  const profile = profiles.value.find((item) => item.id === profileFilter.value)
  return profile?.profileUri ?? profile?.graphIri ?? null
})
const profilePushedDown = computed(() => conformsToIri.value !== null)

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
  truncated,
  partial,
  capped,
  nextCursor,
  cursorEnabled,
  sentinel,
  loadMore,
  retry: retrySearch,
} = useMetadataSearch(q, { groupId: groupFilter, conformsTo: conformsToIri })
const expertMode = ref(queryString(route.query.expert) === '1')
const favBusy = ref<Set<string>>(new Set())
const favError = ref<string | null>(null)
const showNewDataset = ref(false)
const sparql = ref(`SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 25`)
const sparqlResult = ref<SparqlResult | null>(null)
const sparqlError = ref<string | null>(null)
const running = ref(false)

// One watcher builds the whole query from the refs. Spreading route.query in a
// per-ref watcher re-applies a stale value when two refs change in the same tick
// (e.g. clearFilters): vue-router only updates route.query after the async
// navigation settles, so the second replace would resurrect a param the first
// meant to drop.
watch([q, profileFilter, groupFilter, expertMode], ([nq, np, ng, ne]) => {
  if (
    queryString(route.query.q) === nq &&
    queryFilter(route.query.profile) === np &&
    queryFilter(route.query.group) === ng &&
    (queryString(route.query.expert) === '1') === ne
  ) {
    return
  }
  void router.replace({
    query: { ...route.query, q: nq || undefined, profile: np || undefined, group: ng || undefined, expert: ne ? '1' : undefined },
  })
})

// Keep the mounted view in sync with top-bar navigation and browser history.
watch(
  () => route.query,
  (query) => {
    q.value = queryString(query.q)
    profileFilter.value = queryFilter(query.profile)
    groupFilter.value = queryFilter(query.group)
    expertMode.value = queryString(query.expert) === '1'
  },
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
    if (profileFilter.value && !(doc.profileIds ?? []).includes(profileFilter.value)) return false
    if (groupFilter.value && doc.realmId !== groupFilter.value) return false
    if (favouritesOnly.value && !favouriteIds.value.includes(doc.ulid)) return false
    return true
  }),
)
// Workflow runs are their own Discover section: a document counts as a run
// crate when its conformance ids match the Workflow Run Crate profiles
// (w3id.org/ro/wfrun, or the bundled built-in) or when it parses as run
// provenance the way the run panels do.
function isRunCrateDoc(doc: MetadataDoc): boolean {
  if (conformsToWorkflowRun(doc.conformsToIds)) return true
  try {
    return parseRunCrate(doc.roCrate, '') !== null
  } catch {
    return false
  }
}
const catalogSplit = computed(() => {
  const runs: MetadataDoc[] = []
  const datasets: MetadataDoc[] = []
  for (const doc of hits.value) (isRunCrateDoc(doc) ? runs : datasets).push(doc)
  return { runs, datasets }
})
const paged = computed(() => catalogSplit.value.datasets.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

// Group labels: names for groups the caller can see, honest truncated id otherwise.
const groupNames = computed(() => {
  const names = new Map<string, string>()
  for (const group of [...myGroups.value, ...discoverableGroups.value]) names.set(group.id, group.name)
  return names
})
// Stable option set from the loaded catalog and known groups, plus the active
// filter, so a server-side group filter never hides the option it selected.
const groupOptions = computed(() => {
  const labels = new Map<string, string>()
  for (const doc of metadata.value) labels.set(doc.realmId, groupNames.value.get(doc.realmId) ?? truncateMiddle(doc.realmId))
  for (const group of [...myGroups.value, ...discoverableGroups.value]) labels.set(group.id, group.name)
  if (groupFilter.value && !labels.has(groupFilter.value)) {
    labels.set(groupFilter.value, groupNames.value.get(groupFilter.value) ?? truncateMiddle(groupFilter.value))
  }
  return [...labels.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

// Group and profile filters are pushed to the server; only a favourites filter,
// and a non-IRI profile filter, still narrow the returned hits client-side.
const visibleResults = computed(() =>
  searchResults.value.filter((line) => {
    if (favouritesOnly.value && !favouriteIds.value.includes(line.hit.document_id)) return false
    if (profileFilter.value && !profilePushedDown.value && !(line.doc?.profileIds ?? []).includes(profileFilter.value)) return false
    return true
  }),
)
// Only a client-side profile filter hides id-only hits; a pushed-down filter is
// already applied server-side, so every returned hit conforms.
const hiddenByProfile = computed(() =>
  profileFilter.value && !profilePushedDown.value
    ? searchResults.value.filter((line) => !line.doc).length
    : 0,
)

// Beyond metadata, an active query also discovers groups (client-side over the
// loaded group lists, like the top bar), people (server /users/search) and —
// behind the federatedBucketSearch flag — buckets across the realm's nodes
// (the `buckets` section of the unified GET /search).
const bucketSearchEnabled = featureEnabled('federatedBucketSearch')
type SearchKind = 'all' | 'datasets' | 'buckets' | 'groups' | 'people'
const kindFilter = ref<SearchKind>('all')
const KIND_OPTIONS: Array<{ id: SearchKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'datasets', label: 'Datasets' },
  ...(bucketSearchEnabled ? [{ id: 'buckets' as const, label: 'Buckets' }] : []),
  { id: 'groups', label: 'Groups' },
  { id: 'people', label: 'People' },
]
function showKind(kind: Exclude<SearchKind, 'all'>): boolean {
  return kindFilter.value === 'all' || kindFilter.value === kind
}

const groupMatches = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return []
  const seen = new Set<string>()
  const matches = []
  for (const group of [...myGroups.value, ...discoverableGroups.value]) {
    if (seen.has(group.id)) continue
    seen.add(group.id)
    if (`${group.name} ${group.description}`.toLowerCase().includes(term)) matches.push(group)
  }
  return matches
})

// Federated bucket hits via the unified search types param (types=buckets).
// Same debounce/staleness discipline as the people search; ws-* scratch
// buckets never surface.
const bucketResults = ref<BucketSearchHit[]>([])
const bucketNodesQueried = ref(0)
const bucketNodesFailed = ref(0)
const bucketsSearching = ref(false)
let bucketSeq = 0
const runBucketSearch = useDebounceFn(async (term: string) => {
  const seq = ++bucketSeq
  if (!bucketSearchEnabled || term.length < 2 || !currentUser.value) {
    bucketResults.value = []
    bucketsSearching.value = false
    return
  }
  bucketsSearching.value = true
  try {
    const response = await searchUnified(term, { types: ['buckets'], limit: 10 })
    if (seq !== bucketSeq) return
    bucketResults.value = (response.buckets?.hits ?? []).filter((hit) => !isWorkspaceBucket(hit.bucket))
    bucketNodesQueried.value = response.buckets?.nodes_queried ?? 0
    bucketNodesFailed.value = response.buckets?.nodes_failed ?? 0
  } catch {
    // Absent endpoint (older node) and transient failures both hide the section.
    if (seq === bucketSeq) bucketResults.value = []
  } finally {
    if (seq === bucketSeq) bucketsSearching.value = false
  }
}, 300)
watch(q, (term) => void runBucketSearch(term.trim()), { immediate: true })

const bucketsPartial = computed(() => bucketNodesFailed.value > 0)

function bucketHitRoute(hit: BucketSearchHit): RouteLocationRaw {
  return {
    name: 'bucket',
    params: { bucketId: hit.bucket },
    query: isLocalNode(hit.node_id) ? {} : { node: hit.node_id },
  }
}

const peopleResults = ref<UserSearchHit[]>([])
const peopleSearching = ref(false)
let peopleSeq = 0
const runPeopleSearch = useDebounceFn(async (term: string) => {
  const seq = ++peopleSeq
  // /users/search needs an authenticated session and at least two characters.
  if (term.length < 2 || !currentUser.value) {
    peopleResults.value = []
    peopleSearching.value = false
    return
  }
  peopleSearching.value = true
  try {
    const response = await searchUsers(term)
    if (seq === peopleSeq) peopleResults.value = response.users
  } catch {
    if (seq === peopleSeq) peopleResults.value = []
  } finally {
    if (seq === peopleSeq) peopleSearching.value = false
  }
}, 300)
watch(q, (term) => void runPeopleSearch(term.trim()), { immediate: true })

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

async function runQuery() {
  running.value = true
  sparqlError.value = null
  try {
    sparqlResult.value = await runSparql(sparql.value)
  } catch (err) {
    sparqlError.value = err instanceof Error ? err.message : String(err)
    sparqlResult.value = null
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Discover"
      description="Browse the live RO-Crate metadata catalog, filter and search it, or run SPARQL against the Aruna metadata index."
    >
      <template #actions>
        <Button :disabled="!currentUser" @click="showNewDataset = true"><Plus class="h-4 w-4" /> New metadata</Button>
        <div class="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
          <Code2 class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-xs text-foreground/80">SPARQL</span>
          <Switch :checked="expertMode" @update:checked="(v: boolean) => (expertMode = v)" />
        </div>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="!expertMode">
        <div class="surface p-4">
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input v-model="q" placeholder="Search datasets, groups and people…" class="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
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
            <Button variant="outline" size="sm" class="ml-auto" @click="retrySearch">Retry</Button>
          </div>

          <!-- Entity-kind chips: metadata stays the primary result set; groups and
               people render as extra sections like the top-bar quick search. -->
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Result types">
            <button
              v-for="kind in KIND_OPTIONS"
              :key="kind.id"
              type="button"
              :class="[
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                kindFilter === kind.id
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              ]"
              @click="kindFilter = kind.id"
            >
              {{ kind.label }}
            </button>
          </div>

          <section v-if="showKind('groups') && groupMatches.length">
            <div class="mb-3 flex items-center gap-2">
              <Users class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Groups</h2>
              <span class="text-xs text-muted-foreground">{{ groupMatches.length }}</span>
            </div>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RouterLink
                v-for="group in groupMatches"
                :key="group.id"
                :to="{ name: 'groups', params: { id: group.id } }"
                class="surface flex flex-col gap-1 p-4 transition-shadow hover:shadow-md"
              >
                <div class="text-sm font-medium text-foreground">{{ group.name }}</div>
                <p class="line-clamp-2 text-xs text-muted-foreground">{{ group.description || 'No description.' }}</p>
              </RouterLink>
            </div>
          </section>

          <section v-if="bucketSearchEnabled && showKind('buckets') && (bucketResults.length || bucketsSearching)">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <Boxes class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets</h2>
              <span class="text-xs text-muted-foreground">{{ bucketsSearching ? 'Searching…' : bucketResults.length }}</span>
              <span v-if="bucketsPartial && !bucketsSearching" role="status" class="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle class="h-3.5 w-3.5" />
                {{ bucketNodesQueried - bucketNodesFailed }} of {{ bucketNodesQueried }} nodes answered
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <RouterLink
                v-for="hit in bucketResults"
                :key="hit.arn"
                :to="bucketHitRoute(hit)"
                class="surface inline-flex items-center gap-2 px-3 py-2 text-sm transition-shadow hover:shadow-md"
              >
                <Boxes class="h-3.5 w-3.5 text-primary/70" />
                <span class="font-mono text-xs font-medium text-foreground">{{ hit.bucket }}</span>
                <Badge :variant="isLocalNode(hit.node_id) ? 'accent' : 'outline'" class="text-[10px]" :title="hit.node_id">
                  {{ isLocalNode(hit.node_id) ? 'this node' : nodeDisplayName(hit.node_id) }}
                </Badge>
                <span class="text-[10px] text-muted-foreground" :title="hit.group_id">
                  {{ hit.group_name || truncateMiddle(hit.group_id) }}
                </span>
              </RouterLink>
            </div>
          </section>

          <section v-if="showKind('people') && (peopleResults.length || peopleSearching)">
            <div class="mb-3 flex items-center gap-2">
              <UserRound class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">People</h2>
              <span class="text-xs text-muted-foreground">{{ peopleSearching ? 'Searching…' : peopleResults.length }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <RouterLink
                v-for="hit in peopleResults"
                :key="hit.user_id"
                :to="{ name: 'user-profile', params: { id: hit.user_id } }"
                class="surface inline-flex items-center gap-2 px-3 py-2 text-sm transition-shadow hover:shadow-md"
              >
                <UserRound class="h-3.5 w-3.5 text-primary/70" />
                <span class="font-medium text-foreground">{{ hit.name }}</span>
                <span class="font-mono text-[10px] text-muted-foreground" :title="hit.user_id">{{ shortUserId(hit.user_id) }}</span>
              </RouterLink>
            </div>
          </section>

          <EmptyState
            v-if="kindFilter === 'buckets' && !bucketsSearching && !bucketResults.length"
            title="No matching buckets"
            :description="currentUser ? `No bucket on the realm's nodes matched “${q.trim()}”.` : 'Sign in to search for buckets.'"
          />
          <EmptyState
            v-else-if="kindFilter === 'groups' && !groupMatches.length"
            title="No matching groups"
            :description="`No loaded group in ${realm.shortName} matched “${q.trim()}”.`"
          />
          <EmptyState
            v-else-if="kindFilter === 'people' && !peopleSearching && !peopleResults.length"
            title="No matching people"
            :description="currentUser ? `No user in ${realm.shortName} matched “${q.trim()}”.` : 'Sign in to search for people.'"
          />

          <template v-if="showKind('datasets')">
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
          </section>

          <EmptyState
            v-else-if="!cursorEnabled || (searched && !searchPending && !nextCursor && !loadingMore)"
            :title="searchResults.length ? 'No matches after filters' : 'No matches'"
            :description="searchResults.length
              ? 'Results were hidden by the active group, profile or favourites filters.'
              : `No metadata in ${realm.shortName} matched “${q.trim()}”.`"
          >
            <Button v-if="searchResults.length" variant="outline" @click="clearFilters">Clear filters</Button>
          </EmptyState>

          <!-- Paging stays outside the visible-results branch so filters cannot
               strand matches on later server pages. Re-keying the sentinel
               continues paging while a fully filtered page is on screen. -->
          <template v-if="cursorEnabled && searched && !searchError">
            <div v-if="loadingMore" class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton v-for="n in 3" :key="n" class="h-36" />
            </div>
            <div v-if="moreError" class="mt-3 flex items-center justify-center gap-2 text-xs text-destructive">
              {{ moreError }}
              <Button variant="outline" size="sm" @click="loadMore">Try again</Button>
            </div>
            <div v-if="nextCursor && !moreError && !loadingMore" :key="nextCursor" ref="sentinel" class="h-1" aria-hidden="true" />
            <p v-else-if="!moreError && !searchPending && !loadingMore" class="py-2 text-center text-[11px] text-muted-foreground">
              {{ truncated ? 'End of the first results — refine the query to reach matches past the server depth cap.' : 'End of results.' }}
            </p>
          </template>
          <p v-else-if="!cursorEnabled && capped" class="py-2 text-center text-[11px] text-muted-foreground">
            Showing the first 100 matches by relevance — refine the query to narrow results.
          </p>
          </template>
        </template>

        <!-- Browse path: client-side catalog browsing, unchanged apart from the group filter. -->
        <template v-else>
          <section v-if="!bootstrapped || (loading && !metadata.length)" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="n in 6" :key="n" class="h-36" />
          </section>

          <ErrorPanel v-else-if="error" :message="error" @retry="refresh" />

          <template v-else-if="hits.length">
            <section v-if="catalogSplit.datasets.length">
              <div class="mb-3 flex items-center gap-2">
                <FileJson2 class="h-4 w-4 text-primary" />
                <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ filtering ? 'Matching metadata' : 'Catalog' }}</h2>
                <span class="text-xs text-muted-foreground">{{ catalogSplit.datasets.length }}</span>
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
              <div v-if="catalogSplit.datasets.length > PAGE_SIZE" class="surface mt-4 overflow-hidden">
                <Pagination v-model:page="page" :page-size="PAGE_SIZE" :total="catalogSplit.datasets.length" label="metadata documents" />
              </div>
            </section>

            <!-- Run crates (Workflow Run RO-Crate / run provenance) get their own
                 section so compute runs never mix with ordinary datasets. -->
            <section v-if="catalogSplit.runs.length">
              <div class="mb-3 flex items-center gap-2">
                <Workflow class="h-4 w-4 text-primary" />
                <h2 class="font-display text-sm font-semibold text-aruna-navy">Workflow runs</h2>
                <span class="text-xs text-muted-foreground">{{ catalogSplit.runs.length }}</span>
              </div>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <CatalogCard
                  v-for="doc in catalogSplit.runs"
                  :key="doc.ulid"
                  :doc="doc"
                  :favourite="isFavourite(doc.ulid)"
                  :can-favourite="Boolean(currentUser)"
                  :favourite-busy="favBusy.has(doc.ulid)"
                  @toggle-favourite="toggleFav"
                />
              </div>
            </section>
          </template>

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
      </template>

      <template v-else>
        <section class="surface p-4">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <Code2 class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">SPARQL workbench</h2>
              <Badge variant="secondary" class="text-[10px] uppercase">real API</Badge>
            </div>
            <Button size="sm" :disabled="running" @click="runQuery"><Play class="h-3.5 w-3.5" /> {{ running ? 'Running…' : 'Run query' }}</Button>
          </div>
          <textarea v-model="sparql" rows="14" class="mt-3 w-full rounded-md border border-input bg-muted/20 p-3 font-mono text-[12px] leading-relaxed text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <p class="mt-2 text-[11px] text-muted-foreground">Only SELECT and ASK queries are accepted by the API.</p>
          <div v-if="sparqlError" class="mt-3 text-xs text-destructive">{{ sparqlError }}</div>
        </section>

        <section v-if="sparqlResult" class="surface overflow-hidden">
          <header class="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>{{ sparqlResult.totalRows }} rows · {{ sparqlResult.tookMs }} ms</span>
            <span class="font-mono">scope: {{ realm.shortName }}</span>
          </header>
          <div class="max-h-[480px] overflow-auto scrollbar-thin">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-background text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th v-for="column in sparqlResult.columns" :key="column" class="px-3 py-2 text-left font-semibold">{{ column }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in sparqlResult.rows" :key="index" class="border-t border-border">
                  <td v-for="column in sparqlResult.columns" :key="column" class="px-3 py-2 font-mono text-[11.5px] text-foreground/80">{{ row[column] }}</td>
                </tr>
                <tr v-if="!sparqlResult.rows.length"><td :colspan="Math.max(1, sparqlResult.columns.length)" class="px-3 py-6 text-center text-xs text-muted-foreground">No rows returned.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>

    <NewDatasetDialog v-model:open="showNewDataset" @created="(doc) => router.push({ name: 'metadata-detail', params: { id: doc.ulid } })" />
  </div>
</template>
