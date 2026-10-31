<script setup lang="ts">
// A shared dataset: its title and description from the crate, and the files this node holds,
// each with a Download. Folder and bucket parts expand in place, one folder level at a time.
// Shared contents are never rendered on the portal origin.
import { computed, onMounted, ref } from 'vue'
import { ChevronRight, Download, File as FileIcon, Folder } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import ListPager from '@/components/ui/ListPager.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { isUnavailable } from '@/composables/useShareVisit'
import { datasetTicket, listDatasetPart, ticketUrl, visitDataset, type VisitDataset, type VisitFile } from '@/lib/api'
import { crateSummary } from '@/lib/shareLinks'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/utils'

type Visit = <T>(call: (token: string, base: string) => Promise<T>) => Promise<T>

const props = defineProps<{ visit: Visit }>()

/** One line of the tree: a dataset file, a part, or an entry inside a part. */
interface Row {
  key: string
  depth: number
  label: string
  folder: boolean
  /** The part's entity id; for a top-level file, the file's own id. */
  entityId: string
  /** Path inside the part; undefined for a top-level entry. */
  path?: string
  file?: VisitFile
  /** The pager under an opened folder of more than 10 entries; its level key. */
  pager?: string
}
type Ready = { state: 'ready'; folders: string[]; files: VisitFile[]; page: number; pageSize: number }
type Level = { state: 'loading' } | { state: 'failed'; message: string } | Ready

const dataset = ref<VisitDataset | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(10)
const levels = ref<Record<string, Level>>({})

const summary = computed(() => (dataset.value ? crateSummary(dataset.value.rocrate) : { title: '', description: '' }))
const top = computed(() => dataset.value?.files ?? [])
const leaf = (name: string) => name.replace(/\/$/, '').split('/').at(-1) || name
const levelKey = (row: Row) => `${row.entityId}\n${row.path ?? ''}`

function children(row: Row): Row[] {
  const level = levels.value[levelKey(row)]
  if (!level) return []
  const depth = row.depth + 1
  if (level.state !== 'ready') return [{ key: `${levelKey(row)}\n${level.state}`, depth, label: level.state === 'loading' ? 'Loading…' : level.message, folder: false, entityId: '' }]
  const below = (path: string, folder: boolean, file?: VisitFile): Row => ({ key: `${row.entityId}\n${path}`, depth, label: leaf(path), folder, entityId: row.entityId, path, file })
  const list = [...level.folders.map((path) => below(path, true)), ...level.files.map((file) => below(file.name, false, file))]
  const shown = list.slice((level.page - 1) * level.pageSize, level.page * level.pageSize)
  const pager: Row[] = list.length > 10 ? [{ key: `${levelKey(row)}\npager`, depth, label: '', folder: false, entityId: '', pager: levelKey(row) }] : []
  return [...shown.flatMap((entry) => [entry, ...(entry.folder ? children(entry) : [])]), ...pager]
}

function readyLevel(key: string): Ready | null {
  const level = levels.value[key]
  return level?.state === 'ready' ? level : null
}

function turnLevel(key: string, change: Partial<Pick<Ready, 'page' | 'pageSize'>>) {
  const level = readyLevel(key)
  if (level) levels.value = { ...levels.value, [key]: { ...level, ...change } }
}

const rows = computed(() =>
  top.value
    .slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
    .map((file): Row => ({ key: file.entity_id, depth: 0, label: file.name || leaf(file.entity_id), folder: file.kind === 'folder', entityId: file.entity_id }))
    .flatMap((row) => [row, ...(row.folder ? children(row) : [])]),
)

onMounted(async () => {
  try {
    dataset.value = await props.visit((token, base) => visitDataset(token, base))
  } catch (cause) {
    if (!isUnavailable(cause)) error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
})

async function toggle(row: Row) {
  const key = levelKey(row)
  if (levels.value[key]) {
    const { [key]: _closed, ...rest } = levels.value
    levels.value = rest
    return
  }
  levels.value = { ...levels.value, [key]: { state: 'loading' } }
  try {
    const found = { folders: [] as string[], files: [] as VisitFile[] }
    let cursor: string | undefined
    do {
      const query = { prefix: row.path, cursor, limit: 1000 }
      const answer = await props.visit((token, base) => listDatasetPart(row.entityId, query, token, base))
      found.folders.push(...answer.folders)
      found.files.push(...answer.files)
      cursor = answer.next_cursor ?? undefined
    } while (cursor)
    if (levels.value[key]) levels.value = { ...levels.value, [key]: { state: 'ready', ...found, page: 1, pageSize: 10 } }
  } catch (cause) {
    if (levels.value[key]) levels.value = { ...levels.value, [key]: { state: 'failed', message: isUnavailable(cause) ? 'This link does not work.' : errorMessage(cause) } }
  }
}

const downloading = ref<string | null>(null)
async function download(row: Row) {
  downloading.value = row.key
  error.value = null
  try {
    // A ticket is single use and short lived, so each click asks for a new one.
    const url = await props.visit(async (token, base) => ticketUrl(base, (await datasetTicket(row.entityId, row.path, token, base)).path))
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
        <div class="min-w-0 overflow-x-auto">
          <table class="data-table w-full text-sm">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left font-semibold">Name</th>
                <th class="px-3 py-2 text-right font-semibold">Size</th>
                <th class="px-3 py-2 text-left font-semibold">Modified</th>
                <th class="py-2 pr-4"><span class="sr-only">Download</span></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in rows" :key="row.key">
                <tr v-if="row.pager" class="border-t border-border">
                  <td colspan="4" :style="{ paddingLeft: `${row.depth * 1.25}rem` }">
                    <ListPager
                      :page="readyLevel(row.pager)?.page ?? 1"
                      :page-size="readyLevel(row.pager)?.pageSize ?? 10"
                      :total="(readyLevel(row.pager)?.folders.length ?? 0) + (readyLevel(row.pager)?.files.length ?? 0)"
                      @update:page="(value: number) => turnLevel(row.pager!, { page: value })"
                      @update:page-size="(value: number) => turnLevel(row.pager!, { pageSize: value })"
                    />
                  </td>
                </tr>
                <tr v-else class="border-t border-border">
                  <td class="max-w-[32rem] py-2 pr-3" :style="{ paddingLeft: `${1 + row.depth * 1.25}rem` }">
                    <button
                      v-if="row.folder"
                      type="button"
                      class="flex max-w-full items-center gap-2 text-left text-primary hover:underline"
                      :aria-expanded="Boolean(levels[levelKey(row)])"
                      @click="toggle(row)"
                    >
                      <ChevronRight class="h-3.5 w-3.5 shrink-0 transition-transform" :class="levels[levelKey(row)] ? 'rotate-90' : ''" aria-hidden="true" />
                      <Folder class="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span class="truncate">{{ row.label }}</span>
                    </button>
                    <span v-else-if="row.entityId" class="flex min-w-0 items-center gap-2 pl-[1.375rem] text-foreground" :title="row.path ?? row.label">
                      <FileIcon class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span class="truncate">{{ row.label }}</span>
                    </span>
                    <span v-else class="block pl-[1.375rem] text-xs text-muted-foreground">{{ row.label }}</span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{{ row.file?.size != null ? formatBytes(row.file.size) : '' }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">{{ row.file?.last_modified ? formatDateTime(row.file.last_modified) : '' }}</td>
                  <td class="py-2 pr-4 text-right">
                    <Button v-if="!row.folder && row.entityId" variant="outline" size="icon-sm" :disabled="downloading === row.key" :aria-label="`Download ${row.label}`" title="Download" @click="download(row)">
                      <Download class="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              </template>
              <tr v-if="!top.length">
                <td colspan="4" class="px-4 py-6 text-center text-xs text-muted-foreground">This node holds no files of the dataset.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ListPager v-if="top.length > 10" v-model:page="page" v-model:page-size="pageSize" :total="top.length" class="border-t border-border" />
      </div>
    </template>
  </div>
</template>
