<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Pagination from '@/components/ui/Pagination.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { CrateNotReadyError, useAruna } from '@/composables/useAruna'
import { relativeTime } from '@/lib/utils'
import { Search, ArrowLeft, ListChecks, Plus, Code2, Star, FileJson2, ExternalLink } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { metadata, profiles, currentUser, loadRoCrate, fullCrates, cratePending } = useAruna()

const q = ref('')
const profileFilter = ref<string | null>(null)
const showCrate = ref(false)
const showNewDataset = ref(false)
const loadingCrate = ref(false)
const crateNotReady = ref(false)
const crateError = ref<string | null>(null)

const detailId = computed(() => (route.params.id as string) || '')
const current = computed(() => metadata.value.find((doc) => doc.ulid === detailId.value))
const currentProfile = computed(() => profiles.value.find((profile) => profile.id === current.value?.profileId))
const favouriteIds = computed(() => currentUser.value?.favouriteMetadataIds ?? [])

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return metadata.value.filter((doc) => {
    if (profileFilter.value && doc.profileId !== profileFilter.value) return false
    if (!needle) return true
    return `${doc.title} ${doc.description} ${doc.keywords.join(' ')} ${doc.author}`.toLowerCase().includes(needle)
  })
})

const PAGE_SIZE = 12
const page = ref(1)
watch([q, profileFilter], () => {
  page.value = 1
})
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

let crateFetchToken = 0

async function fetchCrate(id: string) {
  const token = ++crateFetchToken
  crateError.value = null
  crateNotReady.value = false
  loadingCrate.value = true
  try {
    await loadRoCrate(id)
  } catch (err) {
    if (token !== crateFetchToken) return
    if (err instanceof CrateNotReadyError) crateNotReady.value = true
    else crateError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === crateFetchToken) loadingCrate.value = false
  }
}

watch(
  detailId,
  async (id) => {
    showCrate.value = false
    crateError.value = null
    crateNotReady.value = false
    if (!id) return
    await fetchCrate(id)
  },
  { immediate: true },
)

const referencedFiles = computed<Array<{ id: string; name: string }>>(() => {
  const crate = fullCrates.value[detailId.value] ?? current.value?.roCrate
  if (!crate || typeof crate !== 'object') return []
  const graphValue = (crate as Record<string, unknown>)['@graph']
  if (!Array.isArray(graphValue)) return []
  return graphValue
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
    .filter((entry) => {
      const type = entry['@type']
      return type === 'File' || (Array.isArray(type) && type.includes('File'))
    })
    .map((entry) => {
      const id = typeof entry['@id'] === 'string' ? entry['@id'] : ''
      return { id, name: typeof entry.name === 'string' && entry.name ? entry.name : id }
    })
    .filter((file) => file.id)
})

function open(id: string) {
  router.push({ name: 'metadata-detail', params: { id } })
}

function isFavourite(id: string) {
  return favouriteIds.value.includes(id)
}
</script>

<template>
  <div>
    <PageHeader
      :title="current ? current.title : 'Metadata'"
      :description="current ? `${currentProfile?.name ?? 'No profile'} · ${current.ulid}` : 'Live RO-Crate metadata documents visible through the Aruna API.'"
    >
      <template #actions>
        <RouterLink v-if="current" :to="{ name: 'metadata' }">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Catalog</Button>
        </RouterLink>
        <Button v-else @click="showNewDataset = true" :disabled="!currentUser"><Plus class="h-4 w-4" /> New metadata</Button>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="!current">
        <div class="surface flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div class="relative flex-1">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input v-model="q" placeholder="Search title, keywords, description, author…" class="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span class="text-muted-foreground">Profile:</span>
          <button class="chip transition-colors" :class="profileFilter === null ? 'border-primary/40 text-primary' : ''" @click="profileFilter = null">any</button>
          <button v-for="profile in profiles" :key="profile.id" class="chip transition-colors" :class="profileFilter === profile.id ? 'border-primary/40 text-primary' : ''" @click="profileFilter = profileFilter === profile.id ? null : profile.id">
            {{ profile.shortName }}
          </button>
        </div>

        <div v-if="filtered.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="doc in paged" :key="doc.ulid" class="surface group relative flex h-full cursor-pointer flex-col gap-3 p-4 transition-shadow hover:shadow-md" @click="open(doc.ulid)">
            <Star v-if="isFavourite(doc.ulid)" class="absolute right-3 top-3 h-4 w-4 text-amber-500" fill="currentColor" />
            <div class="pr-6">
              <h3 class="font-display text-sm font-semibold text-aruna-navy">{{ doc.title }}</h3>
              <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ doc.description || doc.ulid }}</p>
            </div>
            <div class="flex flex-wrap gap-1">
              <span v-for="keyword in doc.keywords.slice(0, 4)" :key="keyword" class="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground/70">#{{ keyword }}</span>
            </div>
            <div class="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span class="truncate">{{ doc.author || doc.ulid }}</span>
              <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                <ListChecks class="h-3 w-3" /> {{ profiles.find((profile) => profile.id === doc.profileId)?.shortName ?? 'No profile' }}
              </span>
            </div>
          </article>
        </div>
        <div v-else class="surface p-12 text-center text-sm text-muted-foreground">No visible metadata documents match the filter.</div>

        <div v-if="filtered.length > PAGE_SIZE" class="surface overflow-hidden">
          <Pagination v-model:page="page" :page-size="PAGE_SIZE" :total="filtered.length" label="metadata documents" />
        </div>
      </template>

      <template v-else>
        <article class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <RouterLink v-if="currentProfile" :to="{ name: 'profile-detail', params: { profileId: currentProfile.id } }" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:opacity-80">
                <ListChecks class="h-3 w-3" /> {{ currentProfile.name }}
              </RouterLink>
              <h1 class="mt-3 font-display text-2xl font-semibold tracking-tight text-aruna-navy">{{ current.title }}</h1>
              <p class="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/85">{{ current.description || 'No description in RO-Crate summary.' }}</p>
              <div class="mt-4 flex flex-wrap gap-1.5">
                <span v-for="keyword in current.keywords" :key="keyword" class="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80">#{{ keyword }}</span>
              </div>
            </div>
            <Badge variant="secondary">{{ relativeTime(current.updatedAt) }}</Badge>
          </div>

          <dl class="mt-6 grid gap-3 sm:grid-cols-4">
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Document ID</dt>
              <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ current.ulid }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Profile</dt>
              <dd class="mt-1 text-sm font-medium text-foreground">{{ currentProfile?.shortName ?? 'No profile' }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">License</dt>
              <dd class="mt-1 truncate text-sm">
                <a v-if="current.license" :href="current.license" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-medium text-primary hover:underline">License <ExternalLink class="h-3 w-3" /></a>
                <span v-else class="text-muted-foreground">Not set</span>
              </dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Updated</dt>
              <dd class="mt-1 text-sm font-medium text-foreground">{{ relativeTime(current.updatedAt) }}</dd>
            </div>
          </dl>
        </article>

        <section class="surface p-4">
          <button type="button" class="flex w-full items-center justify-between text-sm font-medium text-foreground/80 hover:text-foreground" @click="showCrate = !showCrate">
            <span class="inline-flex items-center gap-2"><Code2 class="h-3.5 w-3.5 text-muted-foreground" /> RO-Crate JSON-LD</span>
            <span class="text-xs text-muted-foreground">{{ showCrate ? 'hide' : 'show' }}</span>
          </button>
          <div v-if="loadingCrate && cratePending[current.ulid]" class="mt-3 text-xs text-muted-foreground">Preparing the crate…</div>
          <div v-else-if="loadingCrate" class="mt-3 text-xs text-muted-foreground">Loading full RO-Crate…</div>
          <div v-if="crateNotReady" class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>The crate is still being prepared.</span>
            <Button variant="outline" size="sm" @click="fetchCrate(current.ulid)">Retry</Button>
          </div>
          <div v-if="crateError" class="mt-3 text-xs text-destructive">{{ crateError }}</div>
          <pre v-if="showCrate" class="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-4 font-mono text-[11.5px] leading-relaxed text-foreground/85 scrollbar-thin"><code>{{ JSON.stringify(fullCrates[current.ulid] ?? current.roCrate, null, 2) }}</code></pre>
        </section>

        <section class="surface p-5 text-xs text-muted-foreground">
          <div class="flex items-center gap-2 font-medium text-foreground"><FileJson2 class="h-4 w-4 text-primary" /> Referenced data</div>
          <ul v-if="referencedFiles.length" class="mt-3 space-y-2">
            <li v-for="file in referencedFiles" :key="file.id" class="flex flex-wrap items-baseline gap-x-2">
              <span class="font-medium text-foreground">{{ file.name }}</span>
              <a v-if="file.id.startsWith('http')" :href="file.id" target="_blank" rel="noopener" class="inline-flex items-center gap-1 break-all font-mono text-[11px] text-primary hover:underline">{{ file.id }} <ExternalLink class="h-3 w-3 shrink-0" /></a>
              <span v-else class="break-all font-mono text-[11px]">{{ file.id }}</span>
            </li>
          </ul>
          <p v-else class="mt-2">This document does not reference any data files yet.</p>
        </section>
      </template>
    </div>

    <NewDatasetDialog v-model:open="showNewDataset" @created="(doc) => router.push({ name: 'metadata-detail', params: { id: doc.ulid } })" />
  </div>
</template>
