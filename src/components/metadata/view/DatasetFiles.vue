<script setup lang="ts">
// The data entities a dataset references as a folder tree, plus the datasets that reference one
// file, looked up across the Realm on its content identity. A row opens its entity for the rest.
// A linked bucket or folder also shows what the realm knows: its node, counts and top entries.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ReferencedBy from '@/components/data/ReferencedBy.vue'
import VersionActions from '@/components/metadata/view/VersionActions.vue'
import NodeChips from '@/components/nodes/NodeChips.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import IconButton from '@/components/ui/IconButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ListPager from '@/components/ui/ListPager.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useBacklinks } from '@/composables/useBacklinks'
import { useLinkedParts, usePartFolders, type PartEntry } from '@/composables/useLinkedParts'
import { usePagedList } from '@/composables/usePagedList'
import { useS3 } from '@/composables/useS3'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { bucketLayout, declaredFiles } from '@/lib/bucketLayout'
import { folderRoute, objectRoute, parseDataIdentity } from '@/lib/crate/dataIdentity'
import { crateGraph, dataEntityTreeOf, formatContentSize, type DataEntity, type DataEntityNode } from '@/lib/dataEntities'
import { formatCount } from '@/lib/formatCount'
import { looksLikePart } from '@/lib/linkedPart'
import { termNameFromUri } from '@/lib/profiles/uri'
import { formatBinary, isHttpUrl } from '@/lib/utils'
import { ChevronDown, ChevronRight, Ellipsis, Eye, File as FileIcon, Files, Folder, FolderOpen, Info } from '@lucide/vue'

interface PreviewTarget {
  bucket: string
  key: string
  name: string
  size?: number
  contentType?: string
}

const props = defineProps<{ state: DatasetViewState }>()
const emit = defineEmits<{
  (e: 'preview', target: PreviewTarget): void
  (e: 'info', entityId: string): void
}>()
const { detailId, currentCrate, subcrateIris, loadingCrate, crateNotReady } = props.state
const { fetchCrate } = props.state

const s3 = useS3()
const { currentUser, apiBaseUrl } = useAruna()
const { endpoint: s3Endpoint } = s3

// The depth-first hasPart tree (a sub-dataset's parts render indented under
// it), excluding the root, the metadata descriptor and subcrate links.
const dataEntities = computed<DataEntityNode[]>(() =>
  dataEntityTreeOf(currentCrate.value).filter((row) => !subcrateIris.value.has(row.id)),
)

// A Dataset-typed part that names a bucket or a folder: its files are always the current ones.
function linkedPart(row: DataEntity): boolean {
  return row.types.some((type) => termNameFromUri(type) === 'Dataset') && looksLikePart(row.id)
}

// The tree: top folders open, deeper ones closed; a closed folder hides everything below it.
const byId = computed(() => new Map(dataEntities.value.map((row) => [row.id, row])))
const toggled = ref(new Set<string>())
watch(detailId, () => (toggled.value = new Set()))
function isOpen(row: DataEntityNode): boolean {
  return (row.depth === 0) !== toggled.value.has(row.id)
}
function toggle(row: DataEntityNode) {
  const next = new Set(toggled.value)
  if (next.has(row.id)) next.delete(row.id)
  else next.add(row.id)
  toggled.value = next
}
const visibleRows = computed(() =>
  dataEntities.value.filter((row) => {
    for (let parent = byId.value.get(row.parentId); parent; parent = byId.value.get(parent.parentId)) {
      if (!isOpen(parent)) return false
    }
    return true
  }),
)
const { page, pageSize, shown, total, paged } = usePagedList(visibleRows)

// A folder's files, bytes and formats, summed over everything listed below it.
function folderTotals(row: DataEntityNode): { files: number; bytes: number; formats: Set<string> } {
  let files = 0
  let bytes = 0
  const formats = new Set<string>()
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const child = byId.value.get(id)
      if (!child) continue
      if (child.directory) walk(child.childIds)
      else {
        files++
        const size = Number(child.contentSize)
        if (Number.isFinite(size)) bytes += size
        if (child.encodingFormat) formats.add(child.encodingFormat)
      }
    }
  }
  walk(row.childIds)
  return { files, bytes, formats }
}
// A folder may declare more files than the dataset lists, such as a whole bucket.
const rawById = computed(() => new Map(crateGraph(currentCrate.value).map((entity) => [String(entity['@id']), entity])))
function notListed(row: DataEntityNode): number {
  const declared = row.directory ? declaredFiles(rawById.value.get(row.id)) : null
  return declared === null ? 0 : Math.max(0, declared - folderTotals(row).files)
}
// A top folder adds what it declares beyond its listed files, or what its bucket's node counts.
const fileCount = computed(() =>
  dataEntities.value.reduce((sum, row) => {
    if (!row.directory) return sum + 1
    if (row.depth) return sum
    const counted = (partOf(row)?.usage?.objects ?? 0) - folderTotals(row).files
    return sum + Math.max(notListed(row), counted)
  }, 0),
)
const layout = computed(() => bucketLayout(currentCrate.value))

// The linked parts on this page; their top entries are asked for only when nothing else lists them.
const partIds = computed(() => shown.value.filter(linkedPart).map((row) => row.id))
const parts = useLinkedParts(partIds, detailId, (id) => !byId.value.get(id)?.childIds.length && !layout.value.rows.length)
const partOf = (row: DataEntityNode) => parts.value.get(row.id)
const entriesOf = (row: DataEntityNode) => partOf(row)?.entries?.list ?? []

// Signed out, a visitor opens the folders below a part in place, as Data needs a session.
const { folders, keyOf, toggle: toggleFolder, more: moreFolder } = usePartFolders(detailId)
type EntryRow =
  | { kind: 'entry'; key: string; entry: PartEntry; depth: number; open: boolean; loading: boolean }
  | { kind: 'more'; key: string; prefix: string; depth: number; shown: number; loading: boolean }
  | { kind: 'error'; key: string; message: string; depth: number }
function entryRows(row: DataEntityNode): EntryRow[] {
  const part = partOf(row)
  if (!part?.target) return []
  const rows: EntryRow[] = []
  const walk = (prefix: string, list: PartEntry[], more: boolean, depth: number, loading = false, error?: string | null) => {
    for (const entry of list) {
      const opened = entry.prefix ? folders.value.get(keyOf(part, entry.prefix)) : undefined
      rows.push({ kind: 'entry', key: `${prefix}${entry.name}`, entry, depth, open: Boolean(opened), loading: Boolean(opened?.loading) })
      if (opened && entry.prefix) walk(entry.prefix, opened.list, opened.more, depth + 1, opened.loading, opened.error)
    }
    if (error) rows.push({ kind: 'error', key: `${prefix}\nerror`, message: error, depth })
    if (more && !currentUser.value) rows.push({ kind: 'more', key: `${prefix}\n`, prefix, depth, shown: list.length, loading })
  }
  const root = folders.value.get(keyOf(part, part.target.prefix))
  walk(part.target.prefix, root?.list ?? entriesOf(row), root ? root.more : Boolean(part.entries?.more), row.depth + 1, root?.loading, root?.error)
  return rows
}

// A folder's file count: what the dataset lists and declares, or the bucket's own larger count.
function filesOf(row: DataEntityNode): string {
  if (!row.directory) return ''
  const listed = folderTotals(row).files + notListed(row)
  const usage = partOf(row)?.usage
  if (usage && usage.objects > listed) return `${usage.complete ? '' : 'at least '}${formatCount(usage.objects)}`
  return listed ? formatCount(listed) : ''
}
function sizeOf(row: DataEntityNode): string {
  if (!row.directory) return row.contentSize ? formatContentSize(row.contentSize) : ''
  const bytes = folderTotals(row).bytes
  if (bytes) return formatBinary(bytes)
  if (row.contentSize) return formatContentSize(row.contentSize)
  // The current files' size where the node reports it, else every stored version and reference.
  const usage = partOf(row)?.usage
  const counted = usage ? usage.current_bytes ?? usage.logical_bytes + (usage.referenced_bytes ?? 0) : 0
  return counted ? `${usage!.complete ? '' : 'at least '}${formatBinary(counted)}` : ''
}
// The row's own format, else those of the files below it, else those the bucket layout names.
function formatsOf(row: DataEntityNode): string {
  if (row.encodingFormat || !row.directory) return row.encodingFormat ?? ''
  const formats = folderTotals(row).formats
  if (!formats.size && linkedPart(row)) layout.value.rows.forEach((entry) => entry.format && formats.add(entry.format))
  return [...formats].join(', ')
}
const storedOn = (row: DataEntityNode) => partOf(row)?.nodes ?? []
const storedShown = computed(() => shown.value.some((row) => storedOn(row).length))
const columns = computed(() => (storedShown.value ? 6 : 5))

function identityOf(row: DataEntity) {
  return parseDataIdentity(row, s3Endpoint.value)
}

function contentW3id(row: DataEntity): string | null {
  return identityOf(row).contentId
}

const selectedBacklinkId = ref('')
const {
  result: backlinkResult,
  error: backlinkError,
  busy: backlinkLoading,
  load: loadBacklinkLookup,
  reset: resetBacklinks,
} = useBacklinks()

function loadBacklinks(row: DataEntity) {
  const identity = contentW3id(row)
  if (!identity || !currentUser.value) return
  selectedBacklinkId.value = row.id
  void loadBacklinkLookup(
    { target: { kind: 'content_w3ids', content_w3ids: [identity] } },
    apiBaseUrl.value,
  )
}

function retryBacklinks() {
  const row = dataEntities.value.find((entry) => entry.id === selectedBacklinkId.value)
  if (row) loadBacklinks(row)
}

watch(detailId, () => {
  selectedBacklinkId.value = ''
  resetBacklinks()
})

// A version of a bucket stored on more nodes: its id is no web page, so it is never opened as a link.
function globalVersion(row: DataEntity): string | null {
  return identityOf(row).global?.versionId ?? null
}

function entityLink(row: DataEntity): string | undefined {
  if (globalVersion(row)) return undefined
  const target = row.contentUrl ?? (contentW3id(row) ? '' : row.id)
  return target.startsWith('http') ? target : undefined
}

// A file kept at its source, such as another realm: its identity is a web address there.
function externalHost(row: DataEntityNode): string | null {
  if (row.directory || !isHttpUrl(row.id) || identityOf(row).s3 || contentW3id(row) || globalVersion(row)) return null
  return new URL(row.id).host
}

function previewRef(row: DataEntity): { bucket: string; key: string } | null {
  return identityOf(row).s3
}

function browserRoute(row: DataEntity) {
  const s3 = identityOf(row).s3
  return s3 ? objectRoute(s3.bucket, s3.key) : undefined
}

// Where a row opens in Data: a folder (also a whole bucket) as a folder, a file as its object.
function dataRoute(row: DataEntityNode) {
  const part = partOf(row)?.route
  if (part) return part
  if (!row.directory) return browserRoute(row)
  const s3 = identityOf(row).s3
  if (s3) return folderRoute(s3.bucket, s3.key)
  const bucket = (row.contentUrl ?? row.id).match(/^s3:\/\/([^/?]+)\/?$/)?.[1]
  return bucket ? folderRoute(bucket, '') : undefined
}

function canPreview(row: DataEntity): boolean {
  return Boolean(s3.hasActiveKey.value && s3.endpoint.value && previewRef(row))
}

function openPreview(row: DataEntity) {
  const parsed = previewRef(row)
  if (!parsed) return
  const bytes = Number(row.contentSize)
  emit('preview', {
    bucket: parsed.bucket,
    key: parsed.key,
    name: row.name,
    size: row.contentSize && Number.isFinite(bytes) ? bytes : undefined,
    contentType: row.encodingFormat,
  })
}
</script>

<template>
  <section v-if="loadingCrate || crateNotReady || dataEntities.length || layout.rows.length" aria-labelledby="files-heading">
    <SectionHeading id="files-heading" title="Files" :icon="Files" :count="fileCount ? formatCount(fileCount) : undefined" />
    <div class="surface overflow-hidden">
      <table v-if="loadingCrate || dataEntities.length" class="w-full text-sm">
        <thead class="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th class="py-2 pl-[3.25rem] pr-3 text-left font-medium">Name</th>
            <th class="px-3 py-2 text-right font-medium max-sm:hidden">Format</th>
            <th class="px-3 py-2 text-right font-medium max-sm:hidden">Files</th>
            <th class="px-3 py-2 text-right font-medium">Size</th>
            <th v-if="storedShown" class="px-3 py-2 text-left font-medium max-md:hidden">Stored on</th>
            <th class="w-px px-3 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loadingCrate && !dataEntities.length">
            <tr v-for="n in 3" :key="n" class="border-t border-border-subtle">
              <td class="py-2 pl-[3.25rem] pr-3"><Skeleton class="h-4 w-40" /></td>
              <td class="px-3 py-2 max-sm:hidden"><Skeleton class="ml-auto h-4 w-16" /></td>
              <td class="px-3 py-2 max-sm:hidden"><Skeleton class="ml-auto h-4 w-10" /></td>
              <td class="px-3 py-2"><Skeleton class="ml-auto h-4 w-12" /></td>
              <td class="px-3 py-2"></td>
            </tr>
          </template>
          <template v-else>
            <template v-for="row in shown" :key="row.id">
              <tr class="border-t border-border-subtle first:border-t-0">
                <td class="max-w-0 py-1.5 pr-3" :title="row.id">
                  <span class="flex min-w-0 items-center gap-2" :style="{ paddingLeft: `${0.5 + row.depth * 1.5}rem` }">
                    <span class="flex w-6 shrink-0 justify-center">
                      <IconButton
                        v-if="row.directory && (row.childIds.length || entriesOf(row).length)"
                        :label="isOpen(row) ? `Close ${row.name}` : `Open ${row.name}`"
                        class="h-6 w-6"
                        :aria-expanded="isOpen(row)"
                        @click="toggle(row)"
                      >
                        <component :is="isOpen(row) ? ChevronDown : ChevronRight" class="size-3.5" />
                      </IconButton>
                    </span>
                    <component :is="row.directory ? (isOpen(row) ? FolderOpen : Folder) : FileIcon" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <RouterLink
                      v-if="partOf(row)?.route && currentUser"
                      :to="partOf(row)!.route!"
                      class="min-w-0 truncate underline decoration-border underline-offset-4 hover:decoration-foreground"
                      :title="`Open ${row.name} in Data`"
                    >{{ row.name }}</RouterLink>
                    <button
                      v-else
                      type="button"
                      class="min-w-0 truncate text-left underline decoration-border underline-offset-4 hover:decoration-foreground"
                      @click="emit('info', row.id)"
                    >{{ row.name }}</button>
                    <Badge v-if="externalHost(row)" variant="outline" size="sm" :title="`Kept at ${externalHost(row)}`">External</Badge>
                  </span>
                  <span v-if="partOf(row)?.problem" class="block text-[11px] text-muted-foreground" :style="{ paddingLeft: `${3.75 + row.depth * 1.5}rem` }">{{ partOf(row)!.problem }}</span>
                </td>
                <td class="truncate px-3 py-1.5 text-right text-xs text-muted-foreground max-sm:hidden" :title="formatsOf(row)">{{ formatsOf(row) }}</td>
                <td class="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground max-sm:hidden">{{ filesOf(row) }}</td>
                <td class="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{{ sizeOf(row) }}</td>
                <td v-if="storedShown" class="px-3 py-1.5 max-md:hidden"><NodeChips :nodes="storedOn(row)" /></td>
                <td class="px-3 py-1.5">
                  <div class="flex items-center justify-end gap-1">
                    <VersionActions
                      v-if="identityOf(row).global && !row.directory && !linkedPart(row)"
                      :realm-id="identityOf(row).global!.realmId"
                      :version-id="identityOf(row).global!.versionId"
                      :name="row.name"
                      :size="row.contentSize && Number.isFinite(Number(row.contentSize)) ? Number(row.contentSize) : undefined"
                      :content-type="row.encodingFormat"
                    />
                    <IconButton :label="`Show metadata of ${row.name}`" @click="emit('info', row.id)">
                      <Info class="size-3.5" />
                    </IconButton>
                    <DropdownMenu v-if="canPreview(row) || dataRoute(row) || entityLink(row) || (contentW3id(row) && !row.directory)">
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="icon-sm" :aria-label="`More for ${row.name}`" :title="`More for ${row.name}`"><Ellipsis class="size-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-56">
                        <DropdownMenuItem v-if="canPreview(row)" @click="openPreview(row)"><Eye class="h-3.5 w-3.5" /> Preview</DropdownMenuItem>
                        <DropdownMenuItem v-if="dataRoute(row)" as-child>
                          <RouterLink :to="dataRoute(row)!">Open in Data</RouterLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem v-if="entityLink(row)" as-child>
                          <a :href="entityLink(row)" target="_blank" rel="noopener noreferrer">Open the location</a>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          v-if="contentW3id(row) && !row.directory"
                          :disabled="!currentUser || (backlinkLoading && selectedBacklinkId === row.id)"
                          :title="currentUser ? 'Show the datasets that reference this file' : 'Sign in to see which datasets reference this file'"
                          @click.stop="loadBacklinks(row)"
                        >Referenced by</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
              <template v-if="isOpen(row)">
                <template v-for="item in entryRows(row)" :key="`${row.id}:${item.key}`">
                  <tr v-if="item.kind === 'entry'" class="border-t border-border-subtle">
                    <td class="max-w-0 py-1.5 pr-3">
                      <span class="flex min-w-0 items-center gap-2" :style="{ paddingLeft: `${2.5 + item.depth * 1.5}rem` }">
                        <component :is="item.entry.folder ? (item.open ? FolderOpen : Folder) : FileIcon" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <a v-if="item.entry.download" :href="item.entry.download" download class="min-w-0 truncate underline decoration-border underline-offset-4 hover:decoration-foreground" :title="`Download ${item.entry.name}`">{{ item.entry.name }}</a>
                        <button
                          v-else-if="!currentUser && item.entry.prefix"
                          type="button"
                          class="min-w-0 truncate text-left underline decoration-border underline-offset-4 hover:decoration-foreground"
                          :aria-expanded="item.open"
                          :title="item.open ? `Close ${item.entry.name}` : `Open ${item.entry.name}`"
                          @click="toggleFolder(partOf(row)!, item.entry.prefix)"
                        >{{ item.entry.name }}</button>
                        <RouterLink v-else :to="item.entry.route" class="min-w-0 truncate underline decoration-border underline-offset-4 hover:decoration-foreground" :title="item.entry.name">{{ item.entry.name }}</RouterLink>
                      </span>
                    </td>
                    <td class="max-sm:hidden"></td>
                    <td class="max-sm:hidden"></td>
                    <td class="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{{ item.entry.size !== null ? formatBinary(item.entry.size) : '' }}</td>
                    <td :colspan="columns - 4"></td>
                  </tr>
                  <tr v-else-if="item.kind === 'error'" class="border-t border-border-subtle">
                    <td :colspan="columns" class="py-1.5 pr-3 text-xs text-destructive" :style="{ paddingLeft: `${2.5 + item.depth * 1.5}rem` }">
                      The files could not be listed: {{ item.message }}
                    </td>
                  </tr>
                  <tr v-else class="border-t border-border-subtle">
                    <td :colspan="columns" class="py-1.5 pr-3" :style="{ paddingLeft: `${2.5 + item.depth * 1.5}rem` }">
                      <button type="button" class="text-xs text-primary hover:underline disabled:opacity-60" :disabled="item.loading" @click="moreFolder(partOf(row)!, item.prefix, item.shown)">Show more</button>
                    </td>
                  </tr>
                </template>
                <tr v-if="partOf(row)?.entries?.more && dataRoute(row) && currentUser" class="border-t border-border-subtle">
                  <td :colspan="columns" class="py-1.5 pr-3" :style="{ paddingLeft: `${2.5 + (row.depth + 1) * 1.5}rem` }">
                    <RouterLink :to="dataRoute(row)!" class="text-xs text-primary hover:underline">More in Data</RouterLink>
                  </td>
                </tr>
              </template>
              <tr v-if="partOf(row)?.listError" class="border-t border-border-subtle">
                <td :colspan="columns" class="py-1.5 pr-3 text-xs text-destructive" :style="{ paddingLeft: `${3.75 + row.depth * 1.5}rem` }">
                  The files could not be listed: {{ partOf(row)!.listError }}
                </td>
              </tr>
              <tr v-if="notListed(row) && !entriesOf(row).length && (isOpen(row) || !row.childIds.length)" class="border-t border-border-subtle">
                <td :colspan="columns" class="py-1.5 pr-3">
                  <span class="flex min-w-0 items-center gap-2" :style="{ paddingLeft: `${2 + row.depth * 1.5}rem` }">
                    <Files class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span class="text-muted-foreground">{{ formatCount(notListed(row)) }} {{ notListed(row) === 1 ? 'file' : 'files' }} not listed in this dataset</span>
                    <RouterLink v-if="dataRoute(row)" :to="dataRoute(row)!" class="shrink-0 text-xs text-primary hover:underline">Open in Data</RouterLink>
                  </span>
                </td>
              </tr>
              <tr v-if="partOf(row)?.others.length" class="border-t border-border-subtle">
                <td :colspan="columns" class="py-1.5 pr-3 text-xs" :style="{ paddingLeft: `${3.75 + row.depth * 1.5}rem` }">
                  <span class="text-muted-foreground">Also linked by</span>
                  <template v-for="(other, index) in partOf(row)!.others" :key="other.document_id">
                    <RouterLink :to="{ name: 'dataset', params: { id: other.document_id } }" class="ml-1.5 underline decoration-border underline-offset-4 hover:decoration-foreground">{{ other.title || other.document_path }}</RouterLink><template v-if="index < partOf(row)!.others.length - 1">,</template>
                  </template>
                </td>
              </tr>
              <tr v-if="selectedBacklinkId === row.id" class="border-t border-border-subtle bg-muted/15">
                <td :colspan="columns" class="px-5 py-3">
                  <ReferencedBy
                    :preflight="backlinkResult"
                    :busy="backlinkLoading"
                    :error="backlinkError"
                    @retry="retryBacklinks"
                  />
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
      <ListPager v-if="paged" v-model:page="page" v-model:page-size="pageSize" :total="total" class="border-t border-border-subtle" />

      <div v-if="layout.rows.length" class="space-y-2 border-t border-border p-4">
        <p class="text-sm font-medium">Layout <span class="font-normal tabular-nums text-muted-foreground">{{ layout.rows.length }}</span></p>
        <table class="w-full text-sm">
          <thead class="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th class="py-1.5 pr-3 text-left font-medium">Template</th>
              <th class="px-3 py-1.5 text-left font-medium max-sm:hidden">Format</th>
              <th class="px-3 py-1.5 text-right font-medium max-sm:hidden">Count</th>
              <th class="py-1.5 pl-3 text-right font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in layout.rows" :key="entry.id" class="border-b border-border-subtle last:border-0">
              <td class="max-w-0 py-1.5 pr-3">
                <span class="flex min-w-0 items-center gap-2.5">
                  <component :is="entry.folder ? Folder : FileIcon" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span class="min-w-0">
                    <button type="button" class="block max-w-full truncate text-left font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground" @click="emit('info', entry.id)">{{ entry.template }}</button>
                    <span v-if="entry.description" class="block truncate text-xs text-muted-foreground">{{ entry.description }}</span>
                  </span>
                </span>
              </td>
              <td class="truncate px-3 py-1.5 text-xs text-muted-foreground max-sm:hidden">{{ entry.folder ? 'Folder' : entry.format }}</td>
              <td class="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground max-sm:hidden">
                <template v-if="entry.count !== null">{{ formatCount(entry.count) }} {{ entry.folder ? (entry.count === 1 ? 'folder' : 'folders') : entry.count === 1 ? 'file' : 'files' }}</template>
              </td>
              <td class="whitespace-nowrap py-1.5 pl-3 text-right text-xs tabular-nums text-muted-foreground">{{ entry.size !== null ? formatBinary(entry.size) : '' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="layout.variables.length" class="text-xs text-muted-foreground">
          <template v-for="(variable, index) in layout.variables" :key="variable.name">
            <code class="font-mono text-foreground">{{ '{' + variable.name + '}' }}</code> {{ variable.description }}<template v-if="variable.example">, for example <code class="font-mono">{{ variable.example }}</code></template><template v-if="index < layout.variables.length - 1">; </template>
          </template>
        </p>
      </div>

      <EmptyState v-if="crateNotReady" compact title="This dataset is still being prepared.">
        <Button variant="outline" size="sm" @click="fetchCrate(detailId)">Retry</Button>
      </EmptyState>
    </div>
  </section>
</template>
