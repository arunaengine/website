<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { CrateNotReadyError, useAruna } from '@/composables/useAruna'
import { relativeTime } from '@/lib/utils'
import { ArrowLeft, ListChecks, Code2, FileJson2, ExternalLink } from '@lucide/vue'

const route = useRoute()
const { metadata, profiles, loading, loadRoCrate, fullCrates, cratePending } = useAruna()

const showCrate = ref(false)
const loadingCrate = ref(false)
const crateNotReady = ref(false)
const crateError = ref<string | null>(null)

const detailId = computed(() => (route.params.id as string) || '')
const current = computed(() => metadata.value.find((doc) => doc.ulid === detailId.value))
const currentProfile = computed(() => profiles.value.find((profile) => profile.id === current.value?.profileId))

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
</script>

<template>
  <div>
    <PageHeader
      :title="current ? current.title : 'Metadata'"
      :description="current ? `${currentProfile?.name ?? 'No profile'} · ${current.ulid}` : 'Live RO-Crate metadata document.'"
    >
      <template #actions>
        <RouterLink :to="{ name: 'search' }">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="current">
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

      <div v-else class="surface p-12 text-center text-sm text-muted-foreground">
        {{ loading ? 'Loading metadata…' : 'This metadata document is not visible or does not exist.' }}
      </div>
    </div>
  </div>
</template>
