<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import LocalNodeDetails from '@/components/nodes/LocalNodeDetails.vue'
import NodeDetailPanel from '@/components/nodes/NodeDetailPanel.vue'
import LocationAggregates from '@/components/placement/LocationAggregates.vue'
import { connectionLabel, connectionVariant, isDegradedStatus, kindVariant, statusVariant, type BadgeVariant } from '@/components/nodes/node-display'
import { nodeApiBase, probeNode, type NodeProbe } from '@/components/nodes/node-probe'
import { useAruna } from '@/composables/useAruna'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { aggregateByLocation } from '@/lib/placement'
import { formatBytes, formatNumber, truncateMiddle } from '@/lib/utils'
import type { RealmNodeInfo } from '@/lib/api'
import { ApiError } from '@/lib/api'
import { Boxes, ChevronRight, Globe2, HardDrive, MapPin, MapPinned, RefreshCw } from '@lucide/vue'

const route = useRoute()
const { realm, realmInfo, nodeInfo, usageInfo, apiBaseUrl, loadInfo } = useAruna()

const REFRESH_INTERVAL_MS = 60_000
// The very first latency round waits out page-load network contention (asset
// and bootstrap requests share the connection pool); the cells show a muted
// "measuring" meanwhile. Subsequent rounds fire immediately.
const INITIAL_PROBE_DELAY_MS = 2_000

const expandedId = ref('')
const statusError = ref<string | null>(null)
const lastUpdated = ref<Date | null>(null)
const refreshing = ref(false)
const probes = ref<Record<string, NodeProbe>>({})
let probedOnce = false

async function refreshStatus() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    // Info refresh and browser probes run independently: a failing backend
    // answer must not suppress the per-node reachability probes.
    const infoRefresh = loadInfo().then(
      () => {
        statusError.value = null
        lastUpdated.value = new Date()
      },
      (err) => {
        statusError.value = err instanceof ApiError || err instanceof Error ? err.message : String(err)
      },
    )
    // The first round needs a node list; later rounds probe the last-known one.
    if (!realmInfo.value?.nodes?.length) await infoRefresh
    if (!probedOnce) {
      await new Promise((resolve) => setTimeout(resolve, INITIAL_PROBE_DELAY_MS))
      probedOnce = true
    }
    await Promise.all([infoRefresh, probeRealmNodes()])
  } finally {
    refreshing.value = false
  }
}

// The base a node's latency is measured against; the local node falls back to
// the portal's own configured API base so it is probed exactly like the rest.
function probeBase(node: RealmNodeInfo): string | null {
  return nodeApiBase(node) ?? (isLocal(node) ? apiBaseUrl.value : null)
}

async function probeRealmNodes() {
  const targets = (realmInfo.value?.nodes ?? [])
    .map((node) => ({ id: node.node_id, base: probeBase(node) }))
    .filter((target): target is { id: string; base: string } => !!target.base)
  // Drop probes of nodes that left the realm; current nodes keep their last
  // result until the fresh one lands (no flicker back to "measuring").
  const keep = new Set(targets.map((target) => target.id))
  probes.value = Object.fromEntries(Object.entries(probes.value).filter(([id]) => keep.has(id)))
  // Each probe commits as it settles, so a healthy node's latency shows
  // immediately instead of waiting out an offline node's timeout.
  await Promise.all(
    targets.map(async ({ id, base }) => {
      const probe = await probeNode(base)
      probes.value = { ...probes.value, [id]: probe }
    }),
  )
}

onMounted(() => void refreshStatus())
// Minute cadence, paused while the tab is hidden (DashboardView's pattern);
// refreshStatus only swaps refs, so scroll and the open panel are untouched.
const visibility = useDocumentVisibility()
useIntervalFn(() => {
  if (visibility.value === 'visible' && !refreshing.value) void refreshStatus()
}, REFRESH_INTERVAL_MS)

const localPeerId = computed(() => nodeInfo.value?.node.peer_id ?? '')

function isLocal(node: RealmNodeInfo): boolean {
  return node.kind === 'local' || (!!localPeerId.value && node.node_id === localPeerId.value)
}

// The local node's DATA comes from the already-loaded /info; its probe (see
// probeRealmNodes) exists purely for the browser-measured latency.
function probeFor(node: RealmNodeInfo): NodeProbe | undefined {
  if (isLocal(node)) {
    return nodeInfo.value
      ? { state: 'ok', info: nodeInfo.value, usage: usageInfo.value, latencyMs: probes.value[node.node_id]?.latencyMs }
      : probes.value[node.node_id]
  }
  return probes.value[node.node_id]
}

function restBadge(node: RealmNodeInfo): { label: string; variant: BadgeVariant } | null {
  const probe = probeFor(node)
  if (probe?.state === 'unreachable') return { label: 'unreachable', variant: 'destructive' }
  if (probe?.info) {
    const status = probe.info.services.interfaces.rest.status
    return { label: `rest ${status || 'unknown'}`, variant: statusVariant(status) }
  }
  if (!isLocal(node) && nodeApiBase(node)) return { label: 'checking…', variant: 'outline' }
  return null
}

function usageSummary(node: RealmNodeInfo): string | null {
  const usage = probeFor(node)?.usage
  if (!usage) return null
  return `${formatNumber(usage.objects)} obj · ${formatBytes(usage.stored_bytes)}`
}

// Browser-measured /info round trip (min of a cold and a warm sample), for
// every node including the local one.
function latencyFor(node: RealmNodeInfo): number | null {
  const probe = probes.value[node.node_id]
  return probe?.state === 'ok' && probe.latencyMs !== undefined ? probe.latencyMs : null
}
// True while a probeable node's first latency sample has not landed yet (the
// delayed initial round, or a fresh page load).
function latencyPending(node: RealmNodeInfo): boolean {
  return !probes.value[node.node_id] && Boolean(probeBase(node))
}
function latencyClass(ms: number): string {
  if (ms < 150) return 'text-emerald-600 dark:text-emerald-400'
  if (ms < 500) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const kindOrder: Record<RealmNodeInfo['kind'], number> = { local: 0, management: 1, server: 2, user: 3 }

const sortedNodes = computed(() =>
  [...(realmInfo.value?.nodes ?? [])].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.node_id.localeCompare(b.node_id),
  ),
)

const connectedCount = computed(
  () => sortedNodes.value.filter((node) => node.connection_status === 'connected').length,
)
const replicationLabel = computed(() => {
  const factor = realmInfo.value?.metadata_replication.default_replication_factor
  if (factor === null) return 'all eligible nodes'
  return factor === undefined ? 'unknown' : `×${factor}`
})

// Placement location aggregates over the live /info/realm data (aruna#269). Pure
// derivation of the already-served placement map — no gate, no assumed endpoint.
const locationAggregates = computed(() => aggregateByLocation(realmInfo.value?.nodes ?? []))
const mappedLocationCount = computed(() => locationAggregates.value.filter((a) => a.mapped).length)

const unreachableNodes = computed(() =>
  sortedNodes.value.filter((node) => probeFor(node)?.state === 'unreachable'),
)

const degradedNodes = computed(() =>
  sortedNodes.value.filter((node) => {
    const probe = probeFor(node)
    if (probe?.state !== 'ok' || !probe.info) return false
    const interfaces = probe.info.services.interfaces
    return isDegradedStatus(interfaces.rest.status) || isDegradedStatus(interfaces.s3.status)
  }),
)

function nodeIdList(nodes: RealmNodeInfo[]): string {
  return nodes.map((node) => truncateMiddle(node.node_id, 10, 6)).join(', ')
}

const lastUpdatedLabel = computed(() =>
  lastUpdated.value
    ? lastUpdated.value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-',
)

function toggleNode(nodeId: string) {
  expandedId.value = expandedId.value === nodeId ? '' : nodeId
}

const targetNodeId = computed(() => (typeof route.query.node === 'string' ? route.query.node : ''))
let highlightedTarget = ''

watch(
  [targetNodeId, sortedNodes] as const,
  async ([id, nodes]) => {
    if (!id || id === highlightedTarget) return
    if (!nodes.some((node) => node.node_id === id)) return
    highlightedTarget = id
    expandedId.value = id
    await nextTick()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(`status-node-${id}`)
      ?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <PageHeader title="Status" description="Realm topology and local node health, refreshed every minute.">
      <template #actions>
        <span class="text-[11px] tabular-nums text-muted-foreground">Updated {{ lastUpdatedLabel }}</span>
        <Button variant="outline" size="sm" :disabled="refreshing" @click="refreshStatus">
          <RefreshCw class="h-3.5 w-3.5" /> Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <div
        v-if="statusError"
        class="surface border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300"
      >
        Status refresh failed: {{ statusError }}
      </div>

      <div
        v-if="unreachableNodes.length"
        class="surface border-red-500/30 bg-red-500/5 p-4 text-sm text-red-800 dark:text-red-300"
      >
        {{ unreachableNodes.length === 1 ? 'The browser API probe failed for 1 node' : `The browser API probe failed for ${unreachableNodes.length} nodes` }}:
        <span class="font-mono text-xs">{{ nodeIdList(unreachableNodes) }}</span>
      </div>

      <div
        v-if="degradedNodes.length"
        class="surface border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300"
      >
        Degraded interfaces on {{ degradedNodes.length === 1 ? 'node' : 'nodes' }}:
        <span class="font-mono text-xs">{{ nodeIdList(degradedNodes) }}</span>
      </div>

      <section class="surface p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-3">
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white"
              :style="{ backgroundColor: realm.color }"
            >
              <Globe2 class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <h2 class="truncate font-display text-lg font-semibold text-aruna-navy">{{ realm.name }}</h2>
              <p v-if="realm.description && realm.description !== realm.name" class="mt-0.5 text-sm text-muted-foreground">
                {{ realm.description }}
              </p>
              <p v-else-if="!realm.description" class="mt-0.5 text-sm text-muted-foreground">
                This realm has no description yet.
              </p>
              <div class="mt-2 flex items-center gap-1.5">
                <code class="font-mono text-[11px] text-muted-foreground" :title="realm.id">
                  {{ truncateMiddle(realm.id, 12, 8) }}
                </code>
                <CopyButton :value="realm.id" label="Copy realm id" />
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="outline" class="tabular-nums">
              {{ connectedCount }} / {{ sortedNodes.length }} DHT presence confirmed
            </Badge>
            <Badge variant="outline" class="tabular-nums">
              replication {{ replicationLabel }}
            </Badge>
          </div>
        </div>
      </section>

      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <MapPinned class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Locations</h2>
          </div>
          <Badge variant="outline" class="tabular-nums">
            {{ mappedLocationCount }} {{ mappedLocationCount === 1 ? 'location' : 'locations' }}
          </Badge>
        </header>
        <div class="px-5 py-4">
          <LocationAggregates :aggregates="locationAggregates" />
        </div>
      </section>

      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <Boxes class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Realm nodes</h2>
          </div>
          <Badge variant="outline" class="tabular-nums">{{ sortedNodes.length }}</Badge>
        </header>
        <ul class="divide-y divide-border">
          <li v-for="node in sortedNodes" :id="`status-node-${node.node_id}`" :key="node.node_id">
            <div
              class="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
              :class="[
                expandedId === node.node_id && 'bg-muted/30',
                targetNodeId === node.node_id && 'ring-1 ring-inset ring-primary/40',
              ]"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                :aria-expanded="expandedId === node.node_id"
                @click="toggleNode(node.node_id)"
              >
                <ChevronRight
                  :class="['h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expandedId === node.node_id && 'rotate-90']"
                />
                <Badge :variant="kindVariant[node.kind]" class="w-24 justify-center text-[10px] uppercase">
                  {{ node.kind }}
                </Badge>
                <template v-if="node.placement">
                  <span class="chip hidden shrink-0 sm:inline-flex" :title="`Placement location: ${node.placement.location}`">
                    <MapPin class="h-3 w-3" />
                    {{ node.placement.location }}
                  </span>
                  <Badge v-if="node.placement.full" variant="destructive" class="hidden shrink-0 text-[10px] uppercase sm:inline-flex">
                    full
                  </Badge>
                  <Badge v-if="node.placement.draining" variant="warn" class="hidden shrink-0 text-[10px] uppercase sm:inline-flex">
                    draining
                  </Badge>
                </template>
                <code class="min-w-0 truncate font-mono text-xs text-foreground/90" :title="node.node_id">
                  {{ truncateMiddle(node.node_id, 14, 10) }}
                </code>
                <span
                  v-if="isLocal(node)"
                  class="shrink-0 rounded-sm border border-aruna-aqua/30 bg-aruna-aqua/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-aruna-navy dark:text-aruna-aqua"
                >
                  This node
                </span>
              </button>
              <CopyButton :value="node.node_id" label="Copy node id" />
              <span
                v-if="usageSummary(node)"
                class="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline"
              >
                {{ usageSummary(node) }}
              </span>
              <span
                v-if="latencyFor(node) !== null"
                class="shrink-0 font-mono text-[11px] tabular-nums"
                :class="latencyClass(latencyFor(node)!)"
                title="Best of two REST /info round trips measured from this browser"
              >
                {{ Math.round(latencyFor(node)!) }} ms
              </span>
              <span
                v-else-if="latencyPending(node)"
                class="shrink-0 font-mono text-[11px] text-muted-foreground"
                title="The first latency sample is delayed until page load settles"
              >
                measuring…
              </span>
              <Badge
                v-if="restBadge(node)"
                :variant="restBadge(node)!.variant"
                class="shrink-0 text-[10px] uppercase"
              >
                {{ restBadge(node)!.label }}
              </Badge>
              <Badge :variant="connectionVariant(node)" class="shrink-0 gap-1.5 text-[10px] uppercase">
                <span
                  :class="['h-1.5 w-1.5 rounded-full', node.connection_status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500']"
                />
                {{ connectionLabel(node) }}
              </Badge>
            </div>
            <div v-if="expandedId === node.node_id" class="border-t border-border bg-muted/10 px-5 py-4">
              <NodeDetailPanel :node="node" :is-local="isLocal(node)" :probe="probeFor(node)" />
            </div>
          </li>
          <li v-if="!sortedNodes.length" class="px-5 py-8 text-center text-xs text-muted-foreground">
            No nodes reported for this realm yet.
          </li>
        </ul>
      </section>

      <section v-if="nodeInfo" class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <HardDrive class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">This node</h2>
          </div>
          <Badge :variant="statusVariant(nodeInfo.node.status)" class="text-[10px] uppercase">
            {{ nodeInfo.node.status || 'unknown' }}
          </Badge>
        </header>
        <div class="p-5">
          <LocalNodeDetails :info="nodeInfo" />
        </div>
      </section>
    </div>
  </div>
</template>
