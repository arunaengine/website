<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EditMetadataDialog from '@/components/metadata/EditMetadataDialog.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { CrateNotReadyError, readableIri, useAruna } from '@/composables/useAruna'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { relativeTime } from '@/lib/utils'
import { ArrowLeft, ListChecks, Code2, FileJson2, ExternalLink, Pencil, Trash2 } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const {
  metadata,
  metadataItems,
  profiles,
  currentUser,
  userInfo,
  bootstrapped,
  saving,
  loadRoCrate,
  loadMetadata,
  getMetadataDocument,
  deleteMetadataDocument,
  fullCrates,
  cratePending,
} = useAruna()

const showEdit = ref(false)
const showDelete = ref(false)
const deleteError = ref<string | null>(null)
// The document's S3 key path, for the delete confirmation copy.
const currentPath = computed(
  () => metadataItems.value.find((i) => i.document_id === detailId.value)?.document_path ?? fetchedSummary.value?.document_path ?? '',
)

async function confirmDelete() {
  if (!current.value) return
  deleteError.value = null
  try {
    await deleteMetadataDocument(current.value.ulid)
    showDelete.value = false
    router.push({ name: 'search' })
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err)
  }
}
// The owning group_id is the document's realmId (see mapMetadataDoc). Membership
// is a UI heuristic; the backend still enforces write permission (a 403 surfaces
// inside the edit dialog).
const canWrite = computed(() => Boolean(userInfo.value?.groups.some((g) => g.group_id === current.value?.realmId)))

async function onSaved() {
  await fetchCrate(detailId.value)
}

const showCrate = ref(false)
const loadingCrate = ref(false)
const crateNotReady = ref(false)
const crateError = ref<string | null>(null)

// Honest per-document resolution: the catalog list is not authoritative (it can
// be stale after a create, and a missing id there is indistinguishable from a
// private/deleted document), so we fall back to GET /metadata/{id}.
const docState = ref<'loading' | 'found' | 'not-found' | 'forbidden' | 'error'>('loading')
const docError = ref<string | null>(null)
const fetchedSummary = ref<MetadataDocumentSummary | null>(null)

const detailId = computed(() => (route.params.id as string) || '')
const current = computed(() => metadata.value.find((doc) => doc.ulid === detailId.value))
const currentCrate = computed(() => fullCrates.value[detailId.value] ?? current.value?.roCrate ?? {})
const currentProfile = computed(() => profiles.value.find((profile) => profile.id === current.value?.profileId))
// When no local profile resolves, fall back to the first raw conformsTo IRI so an external
// profile association stays visible instead of reading "No profile".
const conformsIri = computed(() => (currentProfile.value ? '' : current.value?.conformsToIds?.[0] ?? ''))
const profileName = computed(() => currentProfile.value?.name ?? (conformsIri.value ? readableIri(conformsIri.value) : 'No profile'))
const profileShortName = computed(() => currentProfile.value?.shortName ?? (conformsIri.value ? readableIri(conformsIri.value) : 'No profile'))

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

let resolveToken = 0

async function resolveDoc(id: string) {
  const token = ++resolveToken
  docError.value = null
  fetchedSummary.value = null
  docState.value = 'loading'
  if (!id) return
  // Already in the catalog: render the rich article and fetch its crate.
  if (metadata.value.some((doc) => doc.ulid === id)) {
    docState.value = 'found'
    await fetchCrate(id)
    return
  }
  // Otherwise ask the backend directly so we can tell missing/private/error
  // apart from a merely stale catalog list.
  try {
    const summary = await getMetadataDocument(id)
    if (token !== resolveToken) return
    fetchedSummary.value = summary
    // The list may be stale right after a create; refresh so the rich article
    // can appear. A failing refresh must not flip us out of 'found'.
    await loadMetadata().catch(() => undefined)
    if (token !== resolveToken) return
    docState.value = 'found'
    await fetchCrate(id)
  } catch (err) {
    if (token !== resolveToken) return
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) docState.value = 'not-found'
    else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) docState.value = 'forbidden'
    else {
      docState.value = 'error'
      docError.value = err instanceof Error ? err.message : String(err)
    }
  }
}

watch(
  // Wait for the initial bootstrap before deciding — the catalog list is empty
  // during the very first load, so an unknown id must not read as not-found.
  [detailId, bootstrapped],
  async ([id, ready]) => {
    showCrate.value = false
    crateError.value = null
    crateNotReady.value = false
    if (!id || !ready) {
      docState.value = 'loading'
      return
    }
    await resolveDoc(id)
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
      :title="current ? current.title : fetchedSummary ? fetchedSummary.document_path : 'Metadata'"
      :description="current ? `${profileName} · ${current.ulid}` : fetchedSummary ? fetchedSummary.document_id : 'Live RO-Crate metadata document.'"
    >
      <template #actions>
        <Button v-if="current && canWrite" variant="outline" @click="showEdit = true"><Pencil class="h-4 w-4" /> Edit</Button>
        <Button v-if="current && canWrite" variant="outline" class="text-destructive hover:text-destructive" @click="deleteError = null; showDelete = true"><Trash2 class="h-4 w-4" /> Delete</Button>
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
              <span v-else-if="conformsIri" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary" :title="conformsIri">
                <ListChecks class="h-3 w-3" /> {{ profileName }}
              </span>
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
              <dd class="mt-1 break-all text-sm font-medium text-foreground" :title="conformsIri || undefined">{{ profileShortName }}</dd>
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
      </template>

      <!-- Resolved directly but not (yet) in the catalog listing: registry summary. -->
      <article v-else-if="docState === 'found' && fetchedSummary" class="surface p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="break-all font-display text-xl font-semibold tracking-tight text-aruna-navy">{{ fetchedSummary.document_path }}</h1>
            <p class="mt-2 text-sm text-muted-foreground">Showing this document's registry summary; it is not in the catalog listing yet.</p>
          </div>
          <Badge :variant="fetchedSummary.public ? 'success' : 'secondary'" class="text-[10px] uppercase">{{ fetchedSummary.public ? 'public' : 'private' }}</Badge>
        </div>
        <dl class="mt-6 grid gap-3 sm:grid-cols-4">
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Document ID</dt>
            <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ fetchedSummary.document_id }}</dd>
          </div>
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Group</dt>
            <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ fetchedSummary.group_id }}</dd>
          </div>
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Created</dt>
            <dd class="mt-1 text-sm font-medium text-foreground">{{ relativeTime(fetchedSummary.created_at) }}</dd>
          </div>
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Updated</dt>
            <dd class="mt-1 text-sm font-medium text-foreground">{{ relativeTime(fetchedSummary.updated_at) }}</dd>
          </div>
        </dl>
      </article>

      <!-- Crate + referenced data for any resolved document (keyed on detailId). -->
      <template v-if="docState === 'found'">
        <section class="surface p-4">
          <button type="button" class="flex w-full items-center justify-between text-sm font-medium text-foreground/80 hover:text-foreground" @click="showCrate = !showCrate">
            <span class="inline-flex items-center gap-2"><Code2 class="h-3.5 w-3.5 text-muted-foreground" /> RO-Crate JSON-LD</span>
            <span class="text-xs text-muted-foreground">{{ showCrate ? 'hide' : 'show' }}</span>
          </button>
          <div v-if="loadingCrate && cratePending[detailId]" class="mt-3 text-xs text-muted-foreground">Preparing the crate…</div>
          <div v-else-if="loadingCrate" class="mt-3 text-xs text-muted-foreground">Loading full RO-Crate…</div>
          <div v-if="crateNotReady" class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>The crate is still being prepared.</span>
            <Button variant="outline" size="sm" @click="fetchCrate(detailId)">Retry</Button>
          </div>
          <div v-if="crateError" class="mt-3 text-xs text-destructive">{{ crateError }}</div>
          <pre v-if="showCrate" class="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-4 font-mono text-[11.5px] leading-relaxed text-foreground/85 scrollbar-thin"><code>{{ JSON.stringify(currentCrate, null, 2) }}</code></pre>
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

      <div v-else-if="docState === 'loading'" class="surface p-12 text-center text-sm text-muted-foreground">
        Loading metadata…
      </div>

      <div v-else-if="docState === 'not-found'" class="surface px-5 py-12 text-center">
        <p class="text-sm font-medium text-foreground">This metadata document does not exist (or has been deleted).</p>
        <p class="mx-auto mt-2 max-w-md break-all font-mono text-xs text-muted-foreground">{{ detailId }}</p>
        <RouterLink :to="{ name: 'search' }" class="mt-5 inline-flex">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </div>

      <div v-else-if="docState === 'forbidden'" class="surface px-5 py-12 text-center">
        <p class="text-sm font-medium text-foreground">This document is not public.</p>
        <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {{ currentUser ? 'Sign in with an account that can see it.' : 'Sign in with an account that can see it, using the button in the top bar.' }}
        </p>
        <RouterLink :to="{ name: 'search' }" class="mt-5 inline-flex">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </div>

      <ErrorPanel
        v-else-if="docState === 'error'"
        :message="docError ?? 'Failed to load this document.'"
        @retry="resolveDoc(detailId)"
      />
    </div>

    <EditMetadataDialog v-if="current" v-model:open="showEdit" :document-id="current.ulid" @saved="onSaved" />

    <Dialog :open="showDelete" @update:open="(v: boolean) => (showDelete = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete metadata document</DialogTitle>
          <DialogDescription>
            Deletes <span class="font-medium text-foreground">{{ current?.title }}</span>
            (<span class="font-mono text-xs">{{ currentPath }}</span>) and its graph from the catalog. This removes only the RO-Crate metadata; any S3 objects it references are not touched.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ deleteError }}</p>
        <DialogFooter>
          <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="saving" @click="confirmDelete">{{ saving ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
