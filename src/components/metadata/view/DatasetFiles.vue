<script setup lang="ts">
// The data entities a dataset references as a folder tree, plus the datasets that reference one
// file, looked up across the Realm on its content identity. A row opens its entity for the rest.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ReferencedBy from '@/components/data/ReferencedBy.vue'
import LinkedPartActions from '@/components/metadata/view/LinkedPartActions.vue'
import VersionActions from '@/components/metadata/view/VersionActions.vue'
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

// A folder's files and bytes, summed over everything listed below it.
function folderTotals(row: DataEntityNode): { files: number; bytes: number } {
  let files = 0
  let bytes = 0
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const child = byId.value.get(id)
      if (!child) continue
      if (child.directory) walk(child.childIds)
      else {
        files++
        const size = Number(child.contentSize)
        if (Number.isFinite(size)) bytes += size
      }
    }
  }
  walk(row.childIds)
  return { files, bytes }
}
// A folder may declare more files than the dataset lists, such as a whole bucket.
const rawById = computed(() => new Map(crateGraph(currentCrate.value).map((entity) => [String(entity['@id']), entity])))
function notListed(row: DataEntityNode): number {
  const declared = row.directory ? declaredFiles(rawById.value.get(row.id)) : null
  return declared === null ? 0 : Math.max(0, declared - folderTotals(row).files)
}
const fileCount = computed(() =>
  dataEntities.value.reduce((sum, row) => sum + (row.directory ? (row.depth === 0 ? notListed(row) : 0) : 1), 0),
)
const layout = computed(() => bucketLayout(currentCrate.value))

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
  <section aria-labelledby="files-heading">
    <SectionHeading id="files-heading" title="Files" :icon="Files" :count="fileCount ? formatCount(fileCount) : undefined" />
    <div class="surface overflow-hidden">
      <table v-if="loadingCrate || dataEntities.length" class="w-full text-sm">
        <thead class="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th class="py-2 pl-[3.25rem] pr-3 text-left font-medium">Name</th>
            <th class="px-3 py-2 text-right font-medium max-sm:hidden">Format</th>
            <th class="px-3 py-2 text-right font-medium">Size</th>
            <th class="w-px px-3 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loadingCrate && !dataEntities.length">
            <tr v-for="n in 3" :key="n" class="border-t border-border-subtle">
              <td class="py-2 pl-[3.25rem] pr-3"><Skeleton class="h-4 w-40" /></td>
              <td class="px-3 py-2 max-sm:hidden"><Skeleton class="ml-auto h-4 w-16" /></td>
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
                        v-if="row.directory && row.childIds.length"
                        :label="isOpen(row) ? `Close ${row.name}` : `Open ${row.name}`"
                        class="h-6 w-6"
                        :aria-expanded="isOpen(row)"
                        @click="toggle(row)"
                      >
                        <component :is="isOpen(row) ? ChevronDown : ChevronRight" class="size-3.5" />
                      </IconButton>
                    </span>
                    <component :is="row.directory ? (isOpen(row) ? FolderOpen : Folder) : FileIcon" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <button
                      type="button"
                      class="min-w-0 truncate text-left underline decoration-border underline-offset-4 hover:decoration-foreground"
                      @click="emit('info', row.id)"
                    >{{ row.name }}</button>
                    <span v-if="row.directory && folderTotals(row).files + notListed(row)" class="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {{ formatCount(folderTotals(row).files + notListed(row)) }} {{ folderTotals(row).files + notListed(row) === 1 ? 'file' : 'files' }}
                    </span>
                    <Badge v-if="externalHost(row)" variant="outline" size="sm" :title="`Kept at ${externalHost(row)}`">External</Badge>
                  </span>
                  <span v-if="linkedPart(row)" class="block" :style="{ paddingLeft: `${3.75 + row.depth * 1.5}rem` }">
                    <LinkedPartActions :id="row.id" :dataset-id="detailId" />
                  </span>
                </td>
                <td class="truncate px-3 py-1.5 text-right text-xs text-muted-foreground max-sm:hidden" :title="row.encodingFormat">{{ row.encodingFormat || '' }}</td>
                <td class="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                  {{ row.directory ? (folderTotals(row).bytes ? formatBinary(folderTotals(row).bytes) : '') : row.contentSize ? formatContentSize(row.contentSize) : '' }}
                </td>
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
              <tr v-if="notListed(row) && (isOpen(row) || !row.childIds.length)" class="border-t border-border-subtle">
                <td colspan="4" class="py-1.5 pr-3">
                  <span class="flex min-w-0 items-center gap-2" :style="{ paddingLeft: `${2 + row.depth * 1.5}rem` }">
                    <Files class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span class="text-muted-foreground">{{ formatCount(notListed(row)) }} {{ notListed(row) === 1 ? 'file' : 'files' }} not listed in this dataset</span>
                    <RouterLink v-if="dataRoute(row)" :to="dataRoute(row)!" class="shrink-0 text-xs text-primary hover:underline">Open in Data</RouterLink>
                  </span>
                </td>
              </tr>
              <tr v-if="selectedBacklinkId === row.id" class="border-t border-border-subtle bg-muted/15">
                <td colspan="4" class="px-5 py-3">
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
      <EmptyState
        v-else-if="!loadingCrate && !dataEntities.length"
        compact
        title="This dataset does not reference any data files."
        description="Files can be attached by editing this dataset."
      />
    </div>
  </section>
</template>
