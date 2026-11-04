<script setup lang="ts">
// Page-header actions for one dataset: keep it offline, favourite, watch and cite it, export it as
// a crate, edit it; the other transfers and Delete wait in the More menu. A run record leads with
// its results; edit, Ask AI and Copy link move into the menu.
import { computed, ref } from 'vue'
import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import { useAruna } from '@/composables/useAruna'
import { useJobs } from '@/composables/useJobs'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { downloadCrateJson } from '@/lib/crateImport'
import { assistantAvailable } from '@/composables/assistantState'
import { copyToClipboard, errorMessage } from '@/lib/utils'
import { Code2, Download, Ellipsis, FileArchive, FileJson2, FolderOpen, Link, Pencil, Quote, Send, Share2, Sparkles, Star, Trash2, Upload } from '@lucide/vue'

// `results`: where a run record's results open; set only for a run record.
const props = defineProps<{ state: DatasetViewState; run?: boolean; results?: RouteLocationRaw | null }>()
const emit = defineEmits<{
  (e: 'cite'): void
  (e: 'export'): void
  (e: 'import'): void
  (e: 'publish'): void
  (e: 'raw'): void
  (e: 'delete'): void
  (e: 'share'): void
}>()
const {
  detailId,
  docState,
  current,
  currentCrate,
  crateHasEntities,
  canWrite,
  currentPath,
  watchPathPrefix,
  offlineShown,
  offlineSelected,
  offlineBusy,
  setOffline,
} = props.state

const router = useRouter()
const { currentUser, toggleFavourite, downloadProvenanceCrate } = useAruna()
const { jobsEnabled } = useJobs()
const { shown } = usePortalFeatures()

const askPrompt = computed(() =>
  current.value ? `Summarize the dataset "${current.value.title}" (${current.value.ulid}): its files, license, and how it was made.` : '')

// The crate with its provenance, assembled by the node and saved as one file.
const exporting = ref(false)
async function exportCrate() {
  exporting.value = true
  // The page may move on to another dataset while the node assembles this one.
  const id = detailId.value
  try {
    const blob = await downloadProvenanceCrate({ dataset: id })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `${id}.zip`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(anchor.href)
  } catch (err) {
    reportGlobalError(errorMessage(err))
  } finally {
    exporting.value = false
  }
}

const locationHref = () => window.location.href
function askAi() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => useAssistantChat().openWith(askPrompt.value, `dataset ${detailId.value}`))
}

const isFav = computed(() => Boolean(currentUser.value?.favouriteMetadataIds?.includes(detailId.value)))
const favBusy = ref(false)
async function toggleFav() {
  if (favBusy.value) return
  favBusy.value = true
  try {
    await toggleFavourite(detailId.value)
  } catch (err) {
    reportGlobalError(errorMessage(err))
  } finally {
    favBusy.value = false
  }
}
</script>

<template>
  <label
    v-if="offlineShown"
    class="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 text-xs text-muted-foreground"
  >
    <Switch
      :checked="offlineSelected"
      :disabled="offlineBusy"
      aria-label="Available offline"
      @update:checked="setOffline"
    />
    <span>Available offline</span>
  </label>
  <Button
    v-if="current && currentUser"
    variant="outline"
    size="icon-sm"
    :disabled="favBusy"
    :aria-label="isFav ? 'Remove from favourites' : 'Add to favourites'"
    :title="isFav ? 'Remove from favourites' : 'Add to favourites'"
    @click="toggleFav"
  >
    <Star class="h-4 w-4" :class="isFav ? 'text-aruna-royal dark:text-aruna-aqua' : ''" :fill="isFav ? 'currentColor' : 'none'" />
  </Button>
  <WatchButton
    v-if="docState === 'found'"
    surface="dataset"
    size="sm"
    :path-prefix="watchPathPrefix"
    :group-id="current?.realmId ?? null"
    :resource-label="currentPath"
  />
  <AskAiButton v-if="current && !run" :prompt="askPrompt" :subject="`dataset ${current.ulid}`" icon-only />
  <Button v-if="docState === 'found'" variant="outline" size="sm" @click="emit('cite')"><Quote class="h-4 w-4" /> Cite</Button>
  <Button v-if="docState === 'found' && currentUser" variant="outline" size="sm" :disabled="exporting" title="The crate with its provenance as one zip file" @click="exportCrate">
    <Download class="h-4 w-4" /> {{ exporting ? 'Exporting…' : 'Export' }}
  </Button>
  <Button v-if="current && canWrite && !run" variant="outline" size="sm" @click="router.push({ name: 'dataset-edit', params: { id: detailId } })"><Pencil class="h-4 w-4" /> Edit</Button>
  <Button v-else-if="results" size="sm" as-child>
    <RouterLink :to="results"><FolderOpen class="h-4 w-4" /> Show results</RouterLink>
  </Button>
  <!-- The other transfers, the raw crate and Delete, each named by what it moves. -->
  <DropdownMenu v-if="docState === 'found'">
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="icon-sm" :aria-label="run ? 'More actions' : 'More'" :title="run ? 'More actions' : 'More'">
        <Ellipsis class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-80 p-1.5">
      <template v-if="run">
        <DropdownMenuItem class="cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2" @click="copyToClipboard(locationHref())">
          <Link class="h-4 w-4 shrink-0 text-muted-foreground" /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem v-if="current && canWrite" class="cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2" @click="router.push({ name: 'dataset-edit', params: { id: detailId } })">
          <Pencil class="h-4 w-4 shrink-0 text-muted-foreground" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem v-if="current && assistantAvailable" class="cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2" @click="askAi">
          <Sparkles class="h-4 w-4 shrink-0 text-muted-foreground" /> Ask AI
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </template>
      <template v-if="currentUser">
        <DropdownMenuItem class="cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2" @click="emit('share')">
          <Share2 class="h-4 w-4 shrink-0 text-muted-foreground" /> Share
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuLabel>Export</DropdownMenuLabel>
      <DropdownMenuItem
        class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
        :disabled="!crateHasEntities"
        @click="downloadCrateJson(currentCrate)"
      >
        <FileJson2 class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">Metadata file only</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">Downloads ro-crate-metadata.json without any data files.</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        v-if="currentUser && jobsEnabled"
        class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
        @click="emit('export')"
      >
        <FileArchive class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">Whole dataset as a zip archive</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">The metadata with the data files it references, prepared in the background.</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        v-if="currentUser && jobsEnabled && canWrite && shown('repositories')"
        class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
        @click="emit('publish')"
      >
        <Send class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">Publish to repository</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">Deposits the dataset in a repository such as Zenodo.</span>
        </span>
      </DropdownMenuItem>
      <template v-if="canWrite">
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Import</DropdownMenuLabel>
        <DropdownMenuItem class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5" @click="emit('import')">
          <Upload class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0">
            <span class="block text-sm font-medium text-foreground">Replace this dataset from a file</span>
            <span class="block text-xs leading-relaxed text-muted-foreground">Overwrites it with an uploaded ro-crate-metadata.json, previewed first.</span>
          </span>
        </DropdownMenuItem>
      </template>
      <DropdownMenuSeparator />
      <DropdownMenuItem class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5" @click="emit('raw')">
        <Code2 class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="block text-sm font-medium text-foreground">View raw JSON-LD</span>
      </DropdownMenuItem>
      <template v-if="current && canWrite">
        <DropdownMenuSeparator />
        <DropdownMenuItem class="cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-destructive" @click="emit('delete')">
          <Trash2 class="h-4 w-4 shrink-0" /> Delete dataset
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
