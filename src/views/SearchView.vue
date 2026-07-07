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
import ProfileChip from '@/components/metadata/ProfileChip.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { Search, FileJson2, Code2, Play, Plus, Star } from '@lucide/vue'
import type { SparqlResult } from '@/data/types'

const route = useRoute()
const router = useRouter()
const { realm, metadata, profiles, currentUser, loading, error, bootstrapped, refresh, runSparql, toggleFavourite } = useAruna()

const q = ref<string>((route.query.q as string) ?? '')
const profileFilter = ref<string | null>((route.query.profile as string) ?? null)
const favouritesOnly = ref(false)
const expertMode = ref<boolean>(route.query.expert === '1')
const favBusy = ref<Set<string>>(new Set())
const favError = ref<string | null>(null)
const showNewDataset = ref(false)
const sparql = ref(`SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 25`)
const sparqlResult = ref<SparqlResult | null>(null)
const sparqlError = ref<string | null>(null)
const running = ref(false)

watch(q, (next) => router.replace({ query: { ...route.query, q: next || undefined } }))
watch(profileFilter, (next) => router.replace({ query: { ...route.query, profile: next || undefined } }))
watch(expertMode, (next) => router.replace({ query: { ...route.query, expert: next ? '1' : undefined } }))

const PAGE_SIZE = 12
const page = ref(1)
watch([q, profileFilter, favouritesOnly], () => {
  page.value = 1
})

const filtering = computed(() => Boolean(q.value.trim() || profileFilter.value || favouritesOnly.value))
const favouriteIds = computed(() => currentUser.value?.favouriteMetadataIds ?? [])

const hits = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return metadata.value.filter((doc) => {
    if (profileFilter.value && doc.profileId !== profileFilter.value) return false
    if (favouritesOnly.value && !favouriteIds.value.includes(doc.ulid)) return false
    if (!needle) return true
    return `${doc.title} ${doc.description} ${doc.keywords.join(' ')} ${doc.author}`.toLowerCase().includes(needle)
  })
})
const paged = computed(() => hits.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

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
  q.value = ''
  profileFilter.value = null
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
            <input v-model="q" placeholder="Search title, keywords, description, author…" class="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span class="text-muted-foreground">Profile:</span>
            <button class="chip transition-colors" :class="profileFilter === null ? 'border-primary/40 text-primary' : ''" @click="profileFilter = null">any</button>
            <button v-for="profile in profiles" :key="profile.id" class="chip transition-colors" :class="profileFilter === profile.id ? 'border-primary/40 text-primary' : ''" @click="profileFilter = profileFilter === profile.id ? null : profile.id">
              {{ profile.shortName }}
            </button>
            <button v-if="currentUser" class="chip inline-flex items-center gap-1 transition-colors" :class="favouritesOnly ? 'border-amber-400/60 text-amber-600 dark:text-amber-400' : ''" @click="favouritesOnly = !favouritesOnly">
              <Star class="h-3 w-3" :fill="favouritesOnly ? 'currentColor' : 'none'" /> Favourites
            </button>
          </div>
        </div>

        <p v-if="favError" class="text-xs text-destructive">{{ favError }}</p>

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
            <RouterLink v-for="doc in paged" :key="doc.ulid" :to="{ name: 'metadata-detail', params: { id: doc.ulid } }" class="surface group relative flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md">
              <button
                v-if="currentUser"
                type="button"
                class="absolute right-2.5 top-2.5 rounded-md p-1 transition-colors hover:bg-muted disabled:opacity-50"
                :class="isFavourite(doc.ulid) ? 'text-amber-500' : 'text-muted-foreground'"
                :disabled="favBusy.has(doc.ulid)"
                :aria-label="isFavourite(doc.ulid) ? 'Remove from favourites' : 'Add to favourites'"
                @click.prevent.stop="toggleFav(doc.ulid)"
              >
                <Star class="h-4 w-4" :fill="isFavourite(doc.ulid) ? 'currentColor' : 'none'" />
              </button>
              <div class="pr-6">
                <h3 class="font-display text-sm font-semibold text-aruna-navy">{{ doc.title }}</h3>
                <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ doc.description || doc.ulid }}</p>
              </div>
              <div class="flex flex-wrap gap-1">
                <span v-for="keyword in doc.keywords.slice(0, 4)" :key="keyword" class="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground/70">#{{ keyword }}</span>
              </div>
              <div class="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span class="truncate">{{ doc.author || doc.ulid }}</span>
                <ProfileChip :doc="doc" />
              </div>
            </RouterLink>
          </div>
          <div v-if="hits.length > PAGE_SIZE" class="surface mt-4 overflow-hidden">
            <Pagination v-model:page="page" :page-size="PAGE_SIZE" :total="hits.length" label="metadata documents" />
          </div>
        </section>

        <EmptyState
          v-else-if="filtering"
          title="No matches"
          :description="`Nothing in ${realm.shortName} matches your current search${profileFilter ? ' and profile filter' : ''}.`"
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
