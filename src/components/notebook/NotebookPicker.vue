<script setup lang="ts">
// Opens a notebook or chooses the folder of a new one. By default it shows only notebooks and the
// buckets and folders that hold them, with their counts; "Show all files" shows everything.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import { useNotebookFinder } from '@/composables/useNotebookFinder'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useS3, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { countBelow, folderOf, matchNotebooks } from '@/lib/notebook/finder'
import { isNotebookKey } from '@/lib/notebook/document'
import { errorMessage, formatDateTime } from '@/lib/utils'
import { Check, ChevronRight, File, Folder, NotebookPen, Package } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  mode?: 'open' | 'new'
  /** A finder that already searched the buckets; the picker searches itself without one. */
  finder?: ReturnType<typeof useNotebookFinder>
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** `nodeId`: the node holding the bucket; null is the connected node. */
  (e: 'chosen', value: { bucket: string; prefix: string; nodeId: string | null }): void
}>()

const router = useRouter()
const s3 = useS3()
const finder = props.finder ?? useNotebookFinder()
const bucket = ref<string | null>(null)
const prefix = ref('')
const showAll = ref(false)
const query = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  bucket.value = null
  prefix.value = ''
  query.value = ''
  if (finder.state.value === 'idle' || finder.state.value === 'error') void finder.load()
}, { immediate: true })

// The plain listing of the folder on screen; a newer folder drops the older answer.
const folders = ref<FolderEntry[]>([])
const files = ref<ObjectEntry[]>([])
const listing = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const listError = ref<string | null>(null)
let listRun = 0
watch([bucket, prefix, () => props.open], async ([name, at, open]) => {
  const run = ++listRun
  folders.value = []
  files.value = []
  if (!name || !open) {
    listing.value = 'idle'
    return
  }
  listing.value = 'loading'
  listError.value = null
  try {
    // A bucket on another node is read through that node's own session.
    const node = finder.nodes.value.get(name) ?? null
    const reference = node ? await s3.referenceForNode(node, activeGroupId.value) : undefined
    let token: string | undefined
    const seenFolders: FolderEntry[] = []
    const seenFiles: ObjectEntry[] = []
    do {
      const page = node ? await s3.listObjects(name, at, token, node, { reference }) : await s3.listObjects(name, at, token)
      seenFolders.push(...page.folders)
      seenFiles.push(...page.objects)
      token = page.nextToken
    } while (token && seenFolders.length + seenFiles.length < 2000)
    if (run !== listRun) return
    folders.value = seenFolders
    files.value = seenFiles
    listing.value = 'ready'
  } catch (cause) {
    if (run !== listRun) return
    listing.value = 'error'
    listError.value = errorMessage(cause)
  }
})

const scan = computed(() => (bucket.value ? finder.scans.value.get(bucket.value) : undefined))
// Counts are known only for a bucket searched in full; elsewhere nothing is hidden.
const known = computed(() => Boolean(scan.value && !scan.value.truncated))
const countText = (count: number) => (count ? `${count} ${count === 1 ? 'notebook' : 'notebooks'}` : 'No notebooks')

interface Row {
  id: string
  kind: 'bucket' | 'folder' | 'notebook' | 'file'
  name: string
  count?: string
  saved?: string
  where?: string
  go?: () => void
}

const view = computed(() => {
  const rows: Row[] = []
  let hiddenFolders = 0
  let hiddenFiles = 0
  if (query.value.trim()) {
    for (const entry of matchNotebooks(finder.notebooks.value, query.value)) {
      rows.push({
        id: `${entry.bucket}/${entry.key}`, kind: 'notebook', name: entry.key.slice(folderOf(entry.key).length),
        where: `${entry.bucket}/${folderOf(entry.key)}`, saved: entry.lastModified ? formatDateTime(entry.lastModified) : '-',
        go: props.mode === 'new' ? undefined : () => openNotebook(entry.bucket, entry.key, entry.nodeId ?? null),
      })
    }
    return { rows, hiddenFolders, hiddenFiles }
  }
  if (!bucket.value) {
    for (const name of finder.buckets.value) {
      const found = finder.scans.value.get(name)
      const count = found ? found.notebooks.length : 0
      if (!count && found && !found.truncated && !showAll.value) {
        hiddenFolders++
        continue
      }
      rows.push({ id: name, kind: 'bucket', name, count: found?.truncated ? 'Partly searched' : countText(count), saved: '-', go: () => enter(name, '') })
    }
    return { rows, hiddenFolders, hiddenFiles }
  }
  const notebooks = scan.value?.notebooks ?? []
  for (const folder of folders.value) {
    const count = countBelow(notebooks, folder.prefix)
    if (!count && known.value && !showAll.value) {
      hiddenFolders++
      continue
    }
    rows.push({ id: folder.prefix, kind: 'folder', name: `${folder.name}/`, count: known.value ? countText(count) : '-', saved: '-', go: () => enter(bucket.value!, folder.prefix) })
  }
  for (const file of files.value) {
    const notebook = isNotebookKey(file.key)
    if (!notebook && !showAll.value) {
      hiddenFiles++
      continue
    }
    rows.push({
      id: file.key, kind: notebook ? 'notebook' : 'file', name: file.name,
      saved: file.lastModified ? formatDateTime(file.lastModified) : '-',
      go: notebook && props.mode !== 'new' ? () => openNotebook(bucket.value!, file.key, finder.nodes.value.get(bucket.value!) ?? null) : undefined,
    })
  }
  return { rows, hiddenFolders, hiddenFiles }
})

const hiddenText = computed(() => {
  const { hiddenFolders: folderCount, hiddenFiles: fileCount } = view.value
  const parts = [
    folderCount ? `${folderCount} ${bucket.value ? (folderCount === 1 ? 'folder' : 'folders') : (folderCount === 1 ? 'bucket' : 'buckets')}` : '',
    fileCount ? `${fileCount} ${fileCount === 1 ? 'file' : 'files'}` : '',
  ].filter(Boolean)
  return parts.join(', ')
})

const crumbs = computed(() => {
  const parts = prefix.value.split('/').filter(Boolean)
  return [
    { label: 'All buckets', go: () => enter(null, '') },
    ...(bucket.value ? [{ label: bucket.value, go: () => enter(bucket.value, '') }] : []),
    ...parts.map((part, i) => ({ label: part, go: () => enter(bucket.value, `${parts.slice(0, i + 1).join('/')}/`) })),
  ]
})

const busy = computed(() => finder.state.value === 'loading' || listing.value === 'loading')

function enter(name: string | null, at: string) {
  bucket.value = name
  prefix.value = at
  query.value = ''
}

function openNotebook(name: string, key: string, node: string | null) {
  emit('update:open', false)
  void router.push({ name: 'notebook', params: { bucketId: name, key }, query: { group: activeGroupId.value, ...(node ? { node } : {}) } })
}

function useFolder() {
  if (!bucket.value) return
  emit('chosen', { bucket: bucket.value, prefix: prefix.value, nodeId: finder.nodes.value.get(bucket.value) ?? null })
  emit('update:open', false)
}

const ROW_ICON = { bucket: Package, folder: Folder, notebook: NotebookPen, file: File }
</script>

<template>
  <DetailDialog :open="open" content-class="max-w-2xl" fit @update:open="(value: boolean) => emit('update:open', value)">
    <template #header>
      <div class="flex items-start gap-3">
        <IconTile :icon="NotebookPen" tone="aqua" size="sm" />
        <div class="min-w-0">
          <DialogTitle class="type-section-title">{{ mode === 'new' ? 'Choose a folder' : 'Open notebook' }}</DialogTitle>
          <p class="mt-1 text-[13px] text-muted-foreground">
            {{ mode === 'new' ? 'Where the new notebook is saved.' : 'Only notebooks and the folders that hold them are shown.' }}
          </p>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Input v-model="query" class="h-9 min-w-0 flex-1 basis-56" placeholder="Find notebooks in all buckets" aria-label="Find notebooks in all buckets" />
        <label class="inline-flex items-center gap-2 text-sm text-foreground">
          <Switch :checked="showAll" @update:checked="(value: boolean) => (showAll = value)" />
          Show all files
        </label>
      </div>

      <p v-if="query.trim()" class="text-sm text-muted-foreground">
        {{ view.rows.length }} {{ view.rows.length === 1 ? 'notebook' : 'notebooks' }} found in all buckets
      </p>
      <nav v-else aria-label="Location" class="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        <template v-for="(crumb, i) in crumbs" :key="i">
          <ChevronRight v-if="i" class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span v-if="i === crumbs.length - 1" class="font-medium text-foreground">{{ crumb.label }}</span>
          <button v-else type="button" class="text-muted-foreground hover:text-foreground hover:underline" @click="crumb.go">{{ crumb.label }}</button>
        </template>
      </nav>

      <Notice v-if="finder.state.value === 'error'" tone="error">{{ finder.error.value }}</Notice>
      <Notice v-else-if="listing === 'error'" tone="error">{{ listError }}</Notice>
      <div v-if="busy" class="flex justify-center py-6"><Spinner label="Looking for notebooks" /></div>

      <div v-else-if="view.rows.length" class="overflow-x-auto rounded-lg border border-border-subtle">
        <table class="w-full text-sm">
          <thead class="border-b border-border-subtle bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" class="h-9 px-3 text-left font-medium">{{ query.trim() ? 'Notebook' : 'Name' }}</th>
              <th scope="col" class="hidden h-9 px-3 font-medium sm:table-cell" :class="query.trim() ? 'text-left' : 'text-right'">{{ query.trim() ? 'Location' : 'Notebooks' }}</th>
              <th scope="col" class="hidden h-9 px-3 text-right font-medium sm:table-cell">Last saved</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle">
            <tr v-for="row in view.rows" :key="row.id" class="h-10" :class="row.go ? 'cursor-pointer hover:bg-muted/40' : ''" @click="row.go?.()">
              <td class="max-w-0 px-3 py-1.5">
                <span class="flex min-w-0 items-center gap-2">
                  <component :is="ROW_ICON[row.kind]" class="size-4 shrink-0" :class="row.kind === 'notebook' ? 'text-aruna-navy dark:text-aruna-aqua' : row.kind === 'file' ? 'text-muted-foreground' : 'text-primary'" aria-hidden="true" />
                  <span class="min-w-0">
                    <button v-if="row.go" type="button" class="block max-w-full truncate text-left hover:underline" :class="row.kind === 'bucket' ? '' : 'font-mono text-xs'" @click.stop="row.go">{{ row.name }}</button>
                    <span v-else class="block truncate" :class="[row.kind === 'bucket' ? '' : 'font-mono text-xs', row.kind === 'file' ? 'text-muted-foreground' : '']">{{ row.name }}</span>
                    <span v-if="row.where ?? row.count" class="block truncate text-xs text-muted-foreground sm:hidden">{{ row.where ?? row.count }}</span>
                  </span>
                </span>
              </td>
              <td v-if="query.trim()" class="hidden px-3 py-1.5 font-mono text-xs text-muted-foreground sm:table-cell">{{ row.where }}</td>
              <td v-else class="hidden whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground sm:table-cell">{{ row.count ?? '' }}</td>
              <td class="hidden whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground sm:table-cell">{{ row.saved }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="flex flex-col items-center rounded-lg border border-border-subtle px-5 py-8 text-center">
        <IconTile :icon="NotebookPen" tone="aqua" class="mb-3" />
        <p class="text-sm font-medium text-foreground">{{ query.trim() ? 'No notebook matches' : 'No notebooks here' }}</p>
        <Button v-if="!showAll && !query.trim()" variant="outline" size="sm" class="mt-3" @click="showAll = true">Show all files</Button>
      </div>

      <p v-if="!busy && !query.trim() && !showAll && hiddenText" class="text-xs text-muted-foreground">Hidden because they hold no notebooks: {{ hiddenText }}</p>
      <p v-if="finder.partial.value.length" class="text-xs text-muted-foreground">
        Searched only in part, so nothing is hidden there: {{ finder.partial.value.join(', ') }}
      </p>
      <p v-if="finder.failed.value.length" class="text-xs text-muted-foreground">Could not be searched: {{ finder.failed.value.join(', ') }}</p>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" @click="emit('update:open', false)">Cancel</Button>
        <Button v-if="mode === 'new'" size="sm" :disabled="!bucket || Boolean(query.trim())" @click="useFolder"><Check class="h-4 w-4" /> Use this folder</Button>
      </div>
    </template>
  </DetailDialog>
</template>
