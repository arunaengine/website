<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { Search, FileJson2, ListChecks, Code2, Play } from 'lucide-vue-next'
import type { SparqlResult } from '@/data/types'

const route = useRoute()
const router = useRouter()
const { realm, metadata, profiles, runSparql } = useAruna()

const q = ref<string>((route.query.q as string) ?? '')
const profileFilter = ref<string | null>((route.query.profile as string) ?? null)
const expertMode = ref<boolean>(route.query.expert === '1')
const sparql = ref(`SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 25`)
const sparqlResult = ref<SparqlResult | null>(null)
const sparqlError = ref<string | null>(null)
const running = ref(false)

watch(q, (next) => router.replace({ query: { ...route.query, q: next || undefined } }))
watch(profileFilter, (next) => router.replace({ query: { ...route.query, profile: next || undefined } }))
watch(expertMode, (next) => router.replace({ query: { ...route.query, expert: next ? '1' : undefined } }))

const PAGE_SIZE = 10
const page = ref(1)
watch([q, profileFilter], () => {
  page.value = 1
})

const hits = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return metadata.value.filter((doc) => {
    if (profileFilter.value && doc.profileId !== profileFilter.value) return false
    if (!needle) return true
    return `${doc.title} ${doc.description} ${doc.keywords.join(' ')} ${doc.author}`.toLowerCase().includes(needle)
  })
})
const paged = computed(() => hits.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

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
      title="Search"
      description="Search visible real metadata locally, or run SPARQL against the Aruna metadata index."
    >
      <template #actions>
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
            <input v-model="q" placeholder="Search visible metadata…" class="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span class="text-muted-foreground">Profile:</span>
            <button class="chip transition-colors" :class="profileFilter === null ? 'border-primary/40 text-primary' : ''" @click="profileFilter = null">any</button>
            <button v-for="profile in profiles" :key="profile.id" class="chip transition-colors" :class="profileFilter === profile.id ? 'border-primary/40 text-primary' : ''" @click="profileFilter = profileFilter === profile.id ? null : profile.id">
              {{ profile.shortName }}
            </button>
          </div>
        </div>

        <section v-if="hits.length">
          <div class="mb-3 flex items-center gap-2">
            <FileJson2 class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Matching metadata</h2>
            <span class="text-xs text-muted-foreground">{{ hits.length }}</span>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <RouterLink v-for="doc in paged" :key="doc.ulid" :to="{ name: 'metadata-detail', params: { id: doc.ulid } }" class="surface flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-display text-sm font-semibold text-aruna-navy">{{ doc.title }}</h3>
                <Badge variant="outline" class="shrink-0 border-primary/30 text-primary">metadata</Badge>
              </div>
              <p class="line-clamp-2 text-xs text-muted-foreground">{{ doc.description || doc.ulid }}</p>
              <div class="flex flex-wrap gap-1">
                <span v-for="keyword in doc.keywords.slice(0, 4)" :key="keyword" class="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground/70">#{{ keyword }}</span>
              </div>
              <div class="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span class="truncate">{{ doc.author || doc.ulid }}</span>
                <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  <ListChecks class="h-3 w-3" /> {{ profiles.find((profile) => profile.id === doc.profileId)?.shortName ?? 'No profile' }}
                </span>
              </div>
            </RouterLink>
          </div>
          <div v-if="hits.length > PAGE_SIZE" class="surface mt-3 overflow-hidden">
            <Pagination v-model:page="page" :page-size="PAGE_SIZE" :total="hits.length" label="metadata documents" />
          </div>
        </section>

        <div v-else class="surface p-10 text-center text-sm text-muted-foreground">
          No visible metadata in {{ realm.shortName }}{{ q ? ` for &quot;${q}&quot;` : '' }}.
        </div>
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
  </div>
</template>
