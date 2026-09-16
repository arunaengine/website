<script setup lang="ts">
// The data entities a dataset references, plus the datasets that reference one
// file row, looked up across the Realm on its content identity.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ReferencedBy from '@/components/data/ReferencedBy.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useBacklinks } from '@/composables/useBacklinks'
import { useCrateReferences } from '@/composables/useCrateReferences'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import type { DatasetViewState } from '@/composables/useDatasetView'
import type { CrateObjectReference } from '@/lib/crateReferences'
import { dataEntityTreeOf, formatContentSize, type DataEntity, type DataEntityNode } from '@/lib/dataEntities'
import { termNameFromUri } from '@/lib/profiles/uri'
import { Eye, ExternalLink as ExternalLinkIcon, FileJson2, Folder, Info, Link2 } from '@lucide/vue'

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
const { localNodeId, displayName: nodeDisplayName } = useRealmNodes()
const { hasActiveKey: hasS3Access, endpoint: s3Endpoint } = s3

// The depth-first hasPart tree (a sub-dataset's parts render indented under
// it), excluding the root, the metadata descriptor and subcrate links.
const dataEntities = computed<DataEntityNode[]>(() =>
  dataEntityTreeOf(currentCrate.value).filter((row) => !subcrateIris.value.has(row.id)),
)

function rowTypes(row: DataEntity): string {
  return row.types.map(termNameFromUri).join(', ') || '-'
}

// Which OTHER catalog documents reference each file entity here, from the cache-fed
// reverse index (keyed by the row's @id, so self-references are dropped).
const { referencesFor } = useCrateReferences()
const referencedBy = computed(() => {
  const map = new Map<string, CrateObjectReference[]>()
  for (const row of dataEntities.value) {
    const seen = new Set<string>()
    const refs: CrateObjectReference[] = []
    for (const url of [row.id, row.contentUrl]) {
      if (!url) continue
      for (const ref of referencesFor(url)) {
        if (ref.documentId === detailId.value || seen.has(ref.documentId)) continue
        seen.add(ref.documentId)
        refs.push(ref)
      }
    }
    if (refs.length) map.set(row.id, refs)
  }
  return map
})

const CONTENT_W3ID_PREFIX = 'https://w3id.org/aruna/data/'

function contentW3id(row: DataEntity): string | null {
  return row.id.startsWith(CONTENT_W3ID_PREFIX) ? row.id : null
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

function entityLink(row: DataEntity): string | undefined {
  const target = row.contentUrl ?? (contentW3id(row) ? '' : row.id)
  return target.startsWith('http') ? target : undefined
}

function s3RefOf(id: string): { bucket: string; key: string } | null {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(id)
  return match ? { bucket: match[1] as string, key: match[2] as string } : null
}

// Profile artifacts carry a content-addressed W3ID as @id and the real S3
// location in contentUrl, so the preview target prefers contentUrl.
function previewRef(row: DataEntity): { bucket: string; key: string } | null {
  return (row.contentUrl ? s3RefOf(row.contentUrl) : null) ?? s3RefOf(row.id)
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
  <section class="surface overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <FileJson2 class="h-4 w-4 text-primary" /> Referenced data
      <span v-if="dataEntities.length" class="text-xs font-normal text-muted-foreground">{{ dataEntities.length }}</span>
      <div class="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <Badge variant="outline" size="sm">Node: {{ nodeDisplayName(localNodeId) }}</Badge>
        <Badge v-if="hasS3Access" variant="accent" size="sm" :title="s3Endpoint ?? undefined">S3 access active</Badge>
      </div>
    </div>

    <table v-if="loadingCrate || dataEntities.length" class="w-full text-sm">
      <thead class="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th class="px-5 py-2 text-left font-semibold">Name</th>
          <th class="px-5 py-2 text-left font-semibold">Type</th>
          <th class="px-5 py-2 text-left font-semibold">Format</th>
          <th class="px-5 py-2 text-right font-semibold">Size</th>
          <th class="px-5 py-2"></th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loadingCrate && !dataEntities.length">
          <tr v-for="n in 3" :key="n" class="border-t border-border">
            <td class="px-5 py-2.5"><Skeleton class="h-4 w-40" /></td>
            <td class="px-5 py-2.5"><Skeleton class="h-4 w-16" /></td>
            <td class="px-5 py-2.5"><Skeleton class="h-4 w-20" /></td>
            <td class="px-5 py-2.5"><Skeleton class="ml-auto h-4 w-12" /></td>
            <td class="px-5 py-2.5"></td>
          </tr>
        </template>
        <template v-else>
          <template v-for="row in dataEntities" :key="row.id">
            <tr
              class="border-t border-border"
              :class="canPreview(row) ? 'cursor-pointer hover:bg-muted/30' : ''"
              @click="canPreview(row) && openPreview(row)"
            >
              <td class="px-5 py-2.5 font-medium text-foreground" :title="row.id">
                <span class="flex min-w-0 items-center gap-1.5" :style="row.depth ? { paddingLeft: `${row.depth * 1.25}rem` } : undefined">
                  <Folder v-if="row.directory" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span class="truncate">{{ row.name }}</span>
                </span>
                <span v-if="contentW3id(row)" class="mt-0.5 block break-all font-mono text-[10px] font-normal text-muted-foreground">
                  Content identity: {{ row.id }}
                </span>
                <span v-if="row.contentUrl" class="mt-0.5 block break-all text-[10px] font-normal text-muted-foreground">
                  Location:
                  <a v-if="entityLink(row)" :href="entityLink(row)" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline" @click.stop>{{ row.contentUrl }}</a>
                  <span v-else class="font-mono">{{ row.contentUrl }}</span>
                </span>
                <span v-if="referencedBy.get(row.id)?.length" class="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-normal text-muted-foreground">
                  <Link2 class="h-3 w-3 shrink-0" /> Loaded datasets only:
                  <template v-for="(ref, i) in referencedBy.get(row.id) ?? []" :key="ref.documentId">
                    <RouterLink :to="{ name: 'dataset', params: { id: ref.documentId } }" class="text-primary hover:underline" @click.stop>{{ ref.title }}</RouterLink><span v-if="i < (referencedBy.get(row.id)?.length ?? 0) - 1">,</span>
                  </template>
                </span>
              </td>
              <td class="px-5 py-2.5 text-muted-foreground">{{ rowTypes(row) }}</td>
              <td class="px-5 py-2.5 text-muted-foreground">{{ row.encodingFormat || '-' }}</td>
              <td class="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ formatContentSize(row.contentSize) }}</td>
              <td class="px-5 py-2.5 text-right">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    v-if="contentW3id(row) && !row.directory"
                    variant="ghost"
                    size="sm"
                    :disabled="!currentUser || (backlinkLoading && selectedBacklinkId === row.id)"
                    :title="currentUser ? 'Show the datasets that reference this file' : 'Sign in to see which datasets reference this file'"
                    @click.stop="loadBacklinks(row)"
                  >
                    <Link2 class="size-3.5" /> Referenced by
                  </Button>
                  <IconButton :label="`Show metadata of ${row.name}`" @click.stop="emit('info', row.id)">
                    <Info class="size-3.5" />
                  </IconButton>
                  <IconButton v-if="canPreview(row)" label="Preview" @click.stop="openPreview(row)">
                    <Eye class="size-3.5" />
                  </IconButton>
                  <a v-if="entityLink(row)" :href="entityLink(row)" target="_blank" rel="noopener noreferrer" class="inline-flex text-primary hover:opacity-80" :aria-label="`Open the location of ${row.name} in a new tab`" @click.stop>
                    <ExternalLinkIcon class="h-3.5 w-3.5" />
                  </a>
                </div>
              </td>
            </tr>
            <tr v-if="selectedBacklinkId === row.id" class="border-t border-border bg-muted/15">
              <td colspan="5" class="px-5 py-3">
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

    <EmptyState v-if="crateNotReady" compact title="This dataset is still being prepared.">
      <Button variant="outline" size="sm" @click="fetchCrate(detailId)">Retry</Button>
    </EmptyState>
    <EmptyState
      v-else-if="!loadingCrate && !dataEntities.length"
      compact
      title="This dataset does not reference any data files."
      description="Files can be attached by editing this dataset."
    />
  </section>
</template>
