<script setup lang="ts">
// A shared dataset: its title and description from the crate, and the files this node holds,
// each with a Download. Shared contents are never rendered on the portal origin.
import { computed, onMounted, ref } from 'vue'
import { Download, File as FileIcon } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import ListPager from '@/components/ui/ListPager.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { isUnavailable } from '@/composables/useShareVisit'
import { datasetTicket, ticketUrl, visitDataset, type VisitDataset } from '@/lib/api'
import { crateSummary } from '@/lib/shareLinks'
import { errorMessage } from '@/lib/utils'

type Visit = <T>(call: (token: string, base: string) => Promise<T>) => Promise<T>

const props = defineProps<{ visit: Visit }>()

const dataset = ref<VisitDataset | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(10)

const summary = computed(() => (dataset.value ? crateSummary(dataset.value.rocrate) : { title: '', description: '' }))
const files = computed(() => dataset.value?.files ?? [])
const shown = computed(() => files.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const fileName = (file: { entity_id: string; name?: string | null }) => file.name || file.entity_id.split('/').at(-1) || file.entity_id

onMounted(async () => {
  try {
    dataset.value = await props.visit((token, base) => visitDataset(token, base))
  } catch (cause) {
    if (!isUnavailable(cause)) error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
})

const downloading = ref<string | null>(null)
async function download(entityId: string) {
  downloading.value = entityId
  error.value = null
  try {
    const url = await props.visit(async (token, base) => ticketUrl(base, (await datasetTicket(entityId, undefined, token, base)).path))
    window.location.assign(url)
  } catch (cause) {
    if (!isUnavailable(cause)) error.value = errorMessage(cause)
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <Spinner v-if="loading" label="Loading the dataset" />
    <RefusalNote v-if="error" :message="error" />
    <template v-if="dataset">
      <section class="space-y-1">
        <h2 class="text-lg font-semibold text-foreground">{{ summary.title || 'Dataset' }}</h2>
        <p v-if="summary.description" class="whitespace-pre-line text-sm text-muted-foreground">{{ summary.description }}</p>
      </section>
      <div class="surface overflow-hidden">
        <table class="data-table w-full text-sm">
          <thead>
            <tr>
              <th class="w-8 py-2 pl-4"><span class="sr-only">Type</span></th>
              <th class="px-3 py-2 text-left font-semibold">File</th>
              <th class="py-2 pr-4"><span class="sr-only">Download</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in shown" :key="file.entity_id" class="border-t border-border">
              <td class="py-2 pl-4 text-muted-foreground"><FileIcon class="h-4 w-4" aria-hidden="true" /></td>
              <td class="max-w-[32rem] truncate px-3 py-2 text-foreground" :title="fileName(file)">{{ fileName(file) }}</td>
              <td class="py-2 pr-4 text-right">
                <Button variant="outline" size="icon-sm" :disabled="downloading === file.entity_id" :aria-label="`Download ${fileName(file)}`" title="Download" @click="download(file.entity_id)">
                  <Download class="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
            <tr v-if="!files.length">
              <td colspan="3" class="px-4 py-6 text-center text-xs text-muted-foreground">This node holds no files of the dataset.</td>
            </tr>
          </tbody>
        </table>
        <ListPager v-if="files.length > 10" v-model:page="page" v-model:page-size="pageSize" :total="files.length" class="border-t border-border" />
      </div>
    </template>
  </div>
</template>
