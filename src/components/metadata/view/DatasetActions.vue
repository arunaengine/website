<script setup lang="ts">
// Page-header actions for one dataset: keep it offline, favourite it, watch it,
// move it in or out as a crate, edit or delete it.
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
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
import type { DatasetViewState } from '@/composables/useDatasetView'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { downloadCrateJson } from '@/lib/crateImport'
import { errorMessage } from '@/lib/utils'
import { ArrowDownUp, ArrowLeft, ChevronDown, Code2, FileArchive, FileJson2, Pencil, Star, Trash2, Upload } from '@lucide/vue'

const props = defineProps<{ state: DatasetViewState }>()
const emit = defineEmits<{
  (e: 'export'): void
  (e: 'import'): void
  (e: 'raw'): void
  (e: 'delete'): void
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
const { currentUser, toggleFavourite } = useAruna()
const { jobsEnabled } = useJobs()

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
    class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground"
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
    size="icon"
    :disabled="favBusy"
    :aria-label="isFav ? 'Remove from favourites' : 'Add to favourites'"
    @click="toggleFav"
  >
    <Star class="h-4 w-4" :class="isFav ? 'text-amber-500' : ''" :fill="isFav ? 'currentColor' : 'none'" />
  </Button>
  <WatchButton
    v-if="watchPathPrefix"
    :path-prefix="watchPathPrefix"
    event-kind="metadata_created"
    :resource-label="currentPath"
  />
  <!-- One entry point for every transfer; each entry names what it moves,
       so "the description" and "the whole dataset" stay apart. -->
  <DropdownMenu v-if="docState === 'found'">
    <DropdownMenuTrigger as-child>
      <Button variant="outline">
        <ArrowDownUp class="h-4 w-4" /> Import / export
        <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-80 p-1.5">
      <DropdownMenuLabel>Export</DropdownMenuLabel>
      <DropdownMenuItem
        class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
        :disabled="!crateHasEntities"
        @click="downloadCrateJson(currentCrate)"
      >
        <FileJson2 class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">Metadata file only</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">Downloads ro-crate-metadata.json, the description on its own, without any data files.</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        v-if="currentUser && jobsEnabled"
        class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
        @click="emit('export')"
      >
        <FileArchive class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">Whole dataset as a zip archive</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">Packages the metadata together with the data files it references. Prepared in the background.</span>
        </span>
      </DropdownMenuItem>
      <template v-if="canWrite">
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Import</DropdownMenuLabel>
        <DropdownMenuItem
          class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
          @click="emit('import')"
        >
          <Upload class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span class="min-w-0">
            <span class="block text-sm font-medium text-foreground">Replace this dataset from a file</span>
            <span class="block text-xs leading-relaxed text-muted-foreground">Overwrites this dataset with an uploaded ro-crate-metadata.json, previewed first.</span>
          </span>
        </DropdownMenuItem>
      </template>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
        @click="emit('raw')"
      >
        <Code2 class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-foreground">View raw JSON-LD</span>
          <span class="block text-xs leading-relaxed text-muted-foreground">Jumps to the raw RO-Crate JSON at the bottom of the page and expands it.</span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <Button v-if="current && canWrite" variant="outline" @click="router.push({ name: 'dataset-edit', params: { id: detailId } })"><Pencil class="h-4 w-4" /> Edit</Button>
  <Button v-if="current && canWrite" variant="outline" class="text-destructive hover:text-destructive" @click="emit('delete')"><Trash2 class="h-4 w-4" /> Delete</Button>
  <Button variant="outline" as-child>
    <RouterLink :to="{ name: 'datasets' }"><ArrowLeft class="h-4 w-4" /> Datasets</RouterLink>
  </Button>
</template>
