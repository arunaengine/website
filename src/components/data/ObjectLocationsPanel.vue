<script setup lang="ts">
// Where the copies of ONE version of a file physically live, and how to ask
// another node for one. The connected node answers for its own objects only.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Copy, Server } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { copyHeldBack, copyOrigin, copyState } from '@/lib/storage'
import { stateVariant, toneVariant } from '@/lib/stateBadge'
import { truncateMiddle, errorMessage } from '@/lib/utils'
import { ApiError, type BlobCopyResponse, type BlobLocationsResponse } from '@/lib/api'

const props = defineProps<{
  active: boolean
  bucket: string
  objectKey: string
  /** The version to ask about; omitted asks about the current one. */
  versionId?: string | null
  /** Node hosting the bucket; only the connected node can answer. */
  nodeId?: string | null
  groupId: string | null
}>()

const { getBlobLocations, replicateBlob } = useAruna()
const realmNodes = useRealmNodes()

const summary = ref<BlobLocationsResponse | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const missing = ref(false)

const remote = computed(() => Boolean(props.nodeId))

// A copy on the group's own storage sits on machines the node does not run, so
// it cannot vouch for it. Saying that plainly is the point of this panel.
const onGroupBackend = computed(() =>
  (summary.value?.copies ?? []).some((copy) => copy.storage === 'group-backend' && copy.state === 'present'),
)
const storedCount = computed(
  () => (summary.value?.copies ?? []).filter((copy) => copy.state === 'present').length,
)

// Answers first: where the file actually is, then what is on its way, then the
// nodes that could not say.
const ORDER: Record<string, number> = { present: 0, pending: 1, 'not-stored': 2 }
const copies = computed(() =>
  [...(summary.value?.copies ?? [])].sort(
    (left, right) => (ORDER[left.state] ?? 3) - (ORDER[right.state] ?? 3),
  ),
)

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = null
  missing.value = false
  try {
    const response = await getBlobLocations(props.bucket, props.objectKey, props.versionId ?? undefined)
    if (seq !== loadSeq) return
    summary.value = response
  } catch (err) {
    if (seq !== loadSeq) return
    summary.value = null
    // 404 covers both an unknown object and a node that does not serve the
    // endpoint; neither claim can be made on its own, so say both.
    if (err instanceof ApiError && err.status === 404) missing.value = true
    else loadError.value = errorMessage(err)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.active, props.bucket, props.objectKey, props.versionId],
  () => {
    if (props.active && !remote.value) void load()
    else summary.value = null
  },
  { immediate: true },
)

function nodeLabel(copy: BlobCopyResponse): string {
  return realmNodes.displayName(copy.node_id)
}

// A node can hold several copies, so rows repeat the node name and the path
// tells them apart. Shown only when it differs from the requested path.
function otherPath(copy: BlobCopyResponse): string | null {
  if (!copy.bucket || !copy.key) return null
  if (copy.bucket === props.bucket && copy.key === props.objectKey) return null
  return `${copy.bucket}/${copy.key}`
}

// Why the copy is there, in the shared wording. A node that reports no origin
// gets no line rather than a guess.
function originLine(copy: BlobCopyResponse): string | null {
  const path = copy.bucket && copy.key ? `${copy.bucket}/${copy.key}` : null
  return copyOrigin(copy.origin, { local: copy.local, path })
}

function heldBack(copy: BlobCopyResponse): string | null {
  return copyHeldBack(copy.compliance)
}

// 'present' and 'not-stored' are copy words the shared vocabulary does not carry.
function copyVariant(state: string) {
  if (state === 'present') return toneVariant('done')
  if (state === 'not-stored') return toneVariant('idle')
  return stateVariant(state)
}

// Asks one node to fetch a copy. The node answers as soon as the request is
// recorded, so a success here means queued, never stored.
const replicaTarget = ref('')
const replicating = ref(false)
const replicateError = ref<string | null>(null)
const replicateNote = ref<string | null>(null)
const replicateUnsupported = ref(false)

const covered = computed(
  () => new Set((summary.value?.copies ?? [])
    .filter((copy) => copy.state === 'present' || copy.state === 'pending')
    .map((copy) => copy.node_id)),
)
const replicaTargets = computed(() =>
  realmNodes.nodes.value
    .filter((node) => !covered.value.has(node.nodeId))
    .map((node) => ({ value: node.nodeId, label: node.reachable ? node.label : `${node.label} (unreachable)` })),
)

async function replicate() {
  if (!replicaTarget.value || replicating.value) return
  replicating.value = true
  replicateError.value = null
  replicateNote.value = null
  try {
    await replicateBlob({
      bucket: props.bucket,
      path: props.objectKey,
      version_id: summary.value?.version_id,
      node_id: replicaTarget.value,
    })
    replicateNote.value = `A copy was queued for ${realmNodes.displayName(replicaTarget.value)}. It is stored once that node reports it below.`
    replicaTarget.value = ''
    await load()
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      replicateUnsupported.value = true
    } else if (err instanceof ApiError && err.status === 403) {
      replicateError.value = 'Adding a copy needs WRITE permission on this file.'
    } else {
      replicateError.value = errorMessage(err)
    }
  } finally {
    replicating.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <RefusalNote
      v-if="remote"
      tone="warning"
      message="This bucket is served by another node.
Only the node that holds a file can say where its copies are; open the bucket on that node."
    />

    <template v-else>
      <Skeleton v-if="loading && !summary" class="h-24" />
      <EmptyState
        v-else-if="missing"
        compact
        title="Nothing recorded for this file."
        description="Either this node does not know it, or it cannot say where files are stored yet."
      />
      <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />
      <template v-else-if="summary">
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span :title="`Version ${summary.version_id}`">
            {{ props.versionId ? 'Version' : 'Newest version' }}
            <span class="hash">{{ truncateMiddle(summary.version_id, 8, 6) }}</span>
          </span>
          <span>·</span>
          <span>{{ storedCount }} {{ storedCount === 1 ? 'copy' : 'copies' }} stored</span>
        </div>

        <ul class="space-y-1">
          <li
            v-for="copy in copies"
            :key="`${copy.node_id}-${copy.bucket}-${copy.key}`"
            class="rounded-md border border-border px-3 py-2"
          >
            <div class="flex flex-wrap items-center gap-2">
              <Server class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <RouterLink
                :to="{ name: 'status', query: { node: copy.node_id } }"
                class="text-xs font-medium text-primary hover:underline"
                :title="copy.node_id"
              >
                {{ nodeLabel(copy) }}
              </RouterLink>
              <span
                v-if="otherPath(copy)"
                class="max-w-[14rem] truncate font-mono text-[11px] text-muted-foreground"
                :title="otherPath(copy) ?? undefined"
              >
                {{ otherPath(copy) }}
              </span>
              <Badge v-if="copy.local" variant="outline" size="sm" class="uppercase">this node</Badge>
              <Badge :variant="copyVariant(copy.state)" size="sm" class="uppercase" :title="copyState(copy.state).description">
                {{ copyState(copy.state).label }}
              </Badge>
              <span class="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
                <template v-if="copy.storage === 'group-backend'">
                  Group backend ·
                  <span class="font-mono text-foreground/80">{{ copy.group_backend_name || 'unnamed' }}</span>
                </template>
                <template v-else-if="copy.storage === 'node-managed'">
                  Node storage<template v-if="copy.storage_class"> · class
                    <span class="font-mono text-foreground/80">{{ copy.storage_class }}</span></template>
                </template>
                <template v-else>{{ copyState(copy.state).description }}</template>
              </span>
            </div>

            <p v-if="originLine(copy)" class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{{ originLine(copy) }}</span>
              <RouterLink
                v-if="copy.origin === 'sync' && copy.sync_relationship_id"
                :to="{ name: 'bucket-storage', params: { bucketId: props.bucket }, query: { tab: 'syncs' } }"
                class="font-medium text-primary hover:underline"
              >
                Open the syncs of this bucket
              </RouterLink>
            </p>
            <p v-if="heldBack(copy)" class="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="warn" size="sm">{{ heldBack(copy) }}</Badge>
              <DocsLink topic="where-data-lives" section="Placement policies" label="Learn about placement policies" />
            </p>
          </li>
          <li v-if="!copies.length">
            <EmptyState compact title="No node reported a copy of this file." />
          </li>
        </ul>

        <Notice v-if="onGroupBackend" tone="warning" class="flex flex-wrap items-center gap-2">
          <span>Keeping a copy on storage your group runs safe and reachable is up to you.</span>
          <RouterLink
            v-if="props.groupId"
            :to="{ name: 'group', params: { id: props.groupId }, query: { tab: 'storage' } }"
            class="font-medium underline"
          >
            Your group's storage
          </RouterLink>
          <DocsLink topic="where-data-lives" section="Storage locations" label="Learn about storage locations" />
        </Notice>

        <Notice v-if="!summary.complete" tone="warning" class="flex flex-wrap items-center gap-2">
          <span>This list may be incomplete: this node could not reach every place a copy could be.</span>
          <DocsLink topic="where-data-lives" section="Storage locations" label="Learn about storage locations" />
        </Notice>

        <div v-if="!replicateUnsupported" class="space-y-2 rounded-md border border-border px-3 py-2">
          <div>
            <h3 class="text-xs font-medium text-foreground">Add a copy</h3>
            <p class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>Ask another node to fetch this version; the copy is queued, not stored yet.</span>
              <DocsLink topic="where-data-lives" section="Storage locations" label="Learn about storage locations" />
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Select
              v-if="replicaTargets.length"
              v-model="replicaTarget"
              :options="replicaTargets"
              placeholder="Select a node"
              class="min-w-56"
              aria-label="Node to replicate to"
            />
            <span v-else class="text-[11px] text-muted-foreground">
              Every realm node this portal knows already holds or is fetching a copy.
            </span>
            <Button
              v-if="replicaTargets.length"
              variant="outline"
              size="sm"
              :disabled="!replicaTarget || replicating"
              @click="replicate"
            >
              <Copy class="h-3.5 w-3.5" /> {{ replicating ? 'Queueing…' : 'Replicate' }}
            </Button>
          </div>
          <p v-if="replicateNote" class="text-[11px] text-emerald-700 dark:text-emerald-300">{{ replicateNote }}</p>
          <p v-if="replicateError" class="text-[11px] text-destructive">{{ replicateError }}</p>
        </div>
        <p v-else class="text-[11px] text-muted-foreground">
          This node does not offer replication requests.
        </p>

        <div class="flex justify-end">
          <RefreshButton :busy="loading" @click="load" />
        </div>
      </template>
    </template>
  </div>
</template>
