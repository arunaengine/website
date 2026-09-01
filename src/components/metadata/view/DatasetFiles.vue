<script setup lang="ts">
// The data entities a dataset references, plus the authoritative Realm backlink
// lookup one file row can run on its content identity.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useCrateReferences } from '@/composables/useCrateReferences'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { preflightBacklinks, type BacklinkPreflightResponse } from '@/lib/backlinks'
import type { CrateObjectReference } from '@/lib/crateReferences'
import { dataEntityTreeOf, formatContentSize, type DataEntity, type DataEntityNode } from '@/lib/dataEntities'
import { termNameFromUri } from '@/lib/profiles/uri'
import { errorMessage, relativeTime } from '@/lib/utils'
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
const { currentUser, authToken, apiBaseUrl } = useAruna()
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
const backlinkResult = ref<BacklinkPreflightResponse | null>(null)
const backlinkError = ref<string | null>(null)
const backlinkLoading = ref(false)
let backlinkController: AbortController | null = null

const backlinkTarget = computed(() => {
  const result = backlinkResult.value
  if (!result) return null
  const selected = dataEntities.value.find((row) => row.id === selectedBacklinkId.value)
  const identity = selected ? contentW3id(selected) : null
  return result.targets.find((target) => target.content_w3id === identity) ?? result.targets[0] ?? null
})
const backlinkComplete = computed(() => Boolean(
  backlinkResult.value?.complete && !backlinkResult.value.truncated,
))

async function loadBacklinks(row: DataEntity) {
  const identity = contentW3id(row)
  if (!identity || !currentUser.value) return
  backlinkController?.abort()
  const controller = new AbortController()
  backlinkController = controller
  selectedBacklinkId.value = row.id
  backlinkResult.value = null
  backlinkError.value = null
  backlinkLoading.value = true
  try {
    backlinkResult.value = await preflightBacklinks(
      { target: { kind: 'content_w3ids', content_w3ids: [identity] } },
      { baseUrl: apiBaseUrl.value, token: authToken.value },
      controller.signal,
    )
  } catch (err) {
    if (controller.signal.aborted) return
    backlinkError.value = errorMessage(err)
  } finally {
    if (backlinkController === controller) {
      backlinkController = null
      backlinkLoading.value = false
    }
  }
}

function retryBacklinks() {
  const row = dataEntities.value.find((entry) => entry.id === selectedBacklinkId.value)
  if (row) void loadBacklinks(row)
}

function backlinkFreshnessTime(value: number | null): string {
  return value === null ? 'observation time unavailable' : relativeTime(new Date(value).toISOString())
}

watch(detailId, () => {
  backlinkController?.abort()
  backlinkController = null
  selectedBacklinkId.value = ''
  backlinkResult.value = null
  backlinkError.value = null
  backlinkLoading.value = false
})
onBeforeUnmount(() => backlinkController?.abort())

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
                    :title="currentUser ? 'Run an authoritative Realm backlink lookup' : 'Sign in to inspect dataset backlinks'"
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
              <td colspan="5" class="px-5 py-4">
                <div class="rounded-md border border-border bg-background p-4" aria-live="polite">
                  <div class="flex flex-wrap items-center gap-2">
                    <Link2 class="h-4 w-4 text-primary" />
                    <h3 class="font-display text-sm font-semibold text-aruna-navy">Authoritative Realm backlink lookup</h3>
                    <Badge v-if="backlinkResult" :variant="backlinkComplete ? 'success' : 'warn'" size="sm" class="uppercase">
                      {{ backlinkComplete ? 'Complete' : 'Partial' }}
                    </Badge>
                  </div>
                  <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">{{ row.id }}</p>

                  <p v-if="backlinkLoading" class="mt-3 text-xs text-muted-foreground">Checking current Realm indexes…</p>
                  <div v-else-if="backlinkError" class="mt-3 flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <span>{{ backlinkError }}</span>
                    <Button variant="outline" size="sm" @click="retryBacklinks">Retry</Button>
                  </div>
                  <template v-else-if="backlinkResult">
                    <dl class="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div class="surface-muted rounded-md px-3 py-2">
                        <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Scope</dt>
                        <dd class="mt-1 font-medium">{{ backlinkResult.coverage.queried_scope.replaceAll('_', ' ') }}</dd>
                      </div>
                      <div class="surface-muted rounded-md px-3 py-2">
                        <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Overall coverage</dt>
                        <dd class="mt-1 font-medium">{{ backlinkResult.complete ? 'Complete' : 'Incomplete' }}</dd>
                      </div>
                      <div class="surface-muted rounded-md px-3 py-2">
                        <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Realm coverage</dt>
                        <dd class="mt-1 font-medium">{{ backlinkResult.coverage.realm_coverage_complete ? 'Complete' : 'Incomplete' }}</dd>
                      </div>
                      <div class="surface-muted rounded-md px-3 py-2">
                        <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Location-form coverage</dt>
                        <dd class="mt-1 font-medium">{{ backlinkResult.coverage.path_style_endpoint_coverage_complete ? 'Complete' : 'Incomplete' }}</dd>
                      </div>
                    </dl>
                    <div class="mt-3 space-y-1 text-[11px] text-muted-foreground">
                      <p>Target resolution: {{ backlinkResult.coverage.target_resolution_complete ? 'Complete' : 'Incomplete' }}.</p>
                      <p>Nodes queried: {{ backlinkResult.nodes_queried }}. Nodes failed: {{ backlinkResult.nodes_failed }}.</p>
                      <p v-if="backlinkResult.truncated">The authoritative result page is truncated.</p>
                      <p v-if="backlinkResult.failed_partitions.length" class="break-all">Failed partitions: {{ backlinkResult.failed_partitions.join(', ') }}</p>
                      <p v-if="backlinkResult.coverage.queried_forms.length" class="break-all">Queried forms: {{ backlinkResult.coverage.queried_forms.join(', ') }}</p>
                      <p v-for="excluded in backlinkResult.coverage.excluded_forms" :key="excluded.form" class="break-all">Excluded form {{ excluded.form }}: {{ excluded.reason }}</p>
                    </div>
                    <div class="mt-3">
                      <h4 class="font-display text-sm font-semibold text-aruna-navy">Index freshness</h4>
                      <ul v-if="backlinkResult.coverage.node_freshness.length" class="mt-1 divide-y divide-border/60 rounded-md border border-border/60 text-[11px] text-muted-foreground">
                        <li v-for="freshness in backlinkResult.coverage.node_freshness" :key="freshness.node_id" class="flex flex-wrap gap-x-2 px-3 py-1.5">
                          <span class="font-mono" :title="freshness.node_id">{{ nodeDisplayName(freshness.node_id) }}</span>
                          <span>State: {{ freshness.index_state.replaceAll('_', ' ') }}</span>
                          <span :title="freshness.oldest_status_updated_at_ms !== null ? new Date(freshness.oldest_status_updated_at_ms).toISOString() : undefined">Oldest status: {{ backlinkFreshnessTime(freshness.oldest_status_updated_at_ms) }}</span>
                        </li>
                      </ul>
                      <p v-else class="mt-1 text-[11px] text-muted-foreground">No per-node freshness detail was returned.</p>
                    </div>
                    <div class="mt-3">
                      <h4 class="font-display text-sm font-semibold text-aruna-navy">Visible referencing datasets</h4>
                      <ul v-if="backlinkTarget?.visible_references.length" class="mt-1 divide-y divide-border/60 rounded-md border border-border/60">
                        <li v-for="reference in backlinkTarget.visible_references" :key="reference.document_id" class="px-3 py-2 text-xs">
                          <RouterLink :to="{ name: 'dataset', params: { id: reference.document_id } }" class="font-medium text-primary hover:underline">{{ reference.title }}</RouterLink>
                        </li>
                      </ul>
                      <p v-else class="mt-1 text-xs text-muted-foreground">
                        {{ backlinkComplete ? 'No visible referencing datasets were found.' : 'No visible referencing datasets were returned. Coverage is incomplete.' }}
                      </p>
                      <p v-if="backlinkTarget?.hidden_references_exist" class="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">Other restricted datasets reference this content</p>
                    </div>
                  </template>
                </div>
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
