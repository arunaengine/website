<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import RealmTopology from '@/components/dashboard/RealmTopology.vue'
import NodeCards from '@/components/dashboard/NodeCards.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import Button from '@/components/ui/Button.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import Notice from '@/components/ui/Notice.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import InfoHint from '@/components/ui/InfoHint.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import LocalNodeDetails from '@/components/nodes/LocalNodeDetails.vue'
import NodeDialog from '@/components/nodes/NodeDialog.vue'
import LocationAggregates from '@/components/placement/LocationAggregates.vue'
import SectionSkeleton from '@/components/ui/SectionSkeleton.vue'
import { givenName, isDegradedStatus, nodeName, nodeOnline, statusProblem } from '@/components/nodes/node-display'
import { nodeApiBase, probeNode, type NodeProbe } from '@/components/nodes/node-probe'
import { useAruna } from '@/composables/useAruna'
import { useRefresh } from '@/composables/useRefresh'
import { useNodeNames } from '@/composables/useNodeNames'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { onWake, POLL_SLOW_MS } from '@/lib/poll'
import { aggregateByLocation } from '@/lib/placement'
import { errorMessage, formatBytes, formatClock, formatNumber, relativeTime } from '@/lib/utils'
import type { RealmNodeInfo } from '@/lib/api'
import type { RealmView } from '@/composables/aruna/realm'
import { isDesktop } from '@/lib/desktop'
import { computerName } from '@/composables/useRealmNodes'
import { Activity, Boxes, CircleCheck, Clock, Copy, Files, HardDrive, Laptop, MapPinned, Network, Package, Server, TriangleAlert, Unplug, UserRound } from '@lucide/vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useFirstPaint } from '@/composables/useFirstPaint'

const route = useRoute()
const router = useRouter()
const { realm, realmInfo, nodeInfo, usageInfo, apiBaseUrl, currentUser, loadInfo, sessionEpoch, loadRealmView, isRealmAdmin } = useAruna()
const { renameNode } = useNodeNames()
const rename = computed(() => (isRealmAdmin.value ? renameNode : undefined))

// The very first latency round waits out page-load network contention (asset
// and bootstrap requests share the connection pool); the cells show a muted
// "measuring" meanwhile. Subsequent rounds fire immediately.
const INITIAL_PROBE_DELAY_MS = 2_000

const statusError = ref<string | null>(null)
const lastUpdated = ref<Date | null>(null)
const refreshing = ref(false)
const infoSettled = ref(false)
const probes = ref<Record<string, NodeProbe>>({})
let probedOnce = false

// The realm snapshot may already be available from the shared bootstrap. If
// not, wait for this page's first /info load, including a terminal error;
// browser latency probes continue and commit independently afterwards.
const firstInfoReady = computed(() => infoSettled.value || Boolean(realmInfo.value))
const painted = useFirstPaint(() => firstInfoReady.value)

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
        infoSettled.value = true
      },
      (err) => {
        statusError.value = errorMessage(err)
        infoSettled.value = true
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

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refreshStatus)
const spinning = computed(() => refreshBusy.value || refreshing.value)

// The base a node's latency is measured against; the local node falls back to
// the portal's own configured API base so it is probed exactly like the rest.
function probeBase(node: RealmNodeInfo): string | null {
  return nodeApiBase(node) ?? (isLocal(node) ? apiBaseUrl.value : null)
}

async function probeRealmNodes() {
  const targets = infraNodes.value
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
onUnmounted(onWake(() => void refreshStatus()))
// Realm cadence, paused while the tab is hidden (DashboardView's pattern);
// refreshStatus only swaps refs, so scroll and the open panel are untouched.
const visibility = useDocumentVisibility()
useIntervalFn(() => {
  if (visibility.value === 'visible' && !refreshing.value) void refreshStatus()
}, POLL_SLOW_MS)

const localPeerId = computed(() => nodeInfo.value?.node.peer_id ?? '')

function isLocal(node: RealmNodeInfo): boolean {
  return !!localPeerId.value && node.node_id === localPeerId.value
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

const kindOrder: Record<RealmNodeInfo['kind'], number> = { management: 0, server: 1, user: 2 }

// Devices (kind 'user') run on their owner's computer, not on realm
// infrastructure: they are summarized only, never listed, probed or aggregated.
const infraNodes = computed(() => (realmInfo.value?.nodes ?? []).filter((node) => node.kind !== 'user'))
const deviceNodes = computed(() => (realmInfo.value?.nodes ?? []).filter((node) => node.kind === 'user'))
const activeDevices = computed(
  () => deviceNodes.value.filter((node) => node.connection_status === 'seen').length,
)
const offlineDevices = computed(() => deviceNodes.value.filter((node) => !nodeOnline(node)).length)
// Freshest device contact this node recorded, blank until it has heard from one.
const deviceLastSeen = computed(() => {
  const seen = deviceNodes.value.map((node) => node.last_seen_ms ?? 0)
  const latest = Math.max(0, ...seen)
  return latest ? relativeTime(new Date(latest).toISOString()) : ''
})
const ownedDevices = computed(() => {
  const userId = currentUser.value?.id
  return userId ? deviceNodes.value.filter((node) => node.owner === userId).length : 0
})

// On the desktop the API base is the device node, which sees no live heartbeats and no
// connections between realm nodes, so the node map reads them from a realm node.
const desktop = isDesktop()
const realmView = ref<RealmView | null>(null)
let realmViewGeneration = 0
watch([sessionEpoch, () => realmInfo.value?.realm_id], () => {
  realmViewGeneration++
  realmView.value = null
}, { flush: 'sync' })
async function loadPanelRealm() {
  if (!desktop) return
  const generation = realmViewGeneration
  const view = await loadRealmView()
  if (generation === realmViewGeneration) realmView.value = view
}
watch(realmInfo, () => void loadPanelRealm(), { immediate: true })
const panelNodes = computed(() => (realmView.value?.realm ?? realmInfo.value)?.nodes ?? [])
const panelInfra = computed(() => panelNodes.value.filter((node) => node.kind !== 'user'))
const panelDevices = computed(() => panelNodes.value.filter((node) => node.kind === 'user'))

// This computer by its own /system/info, the device node: the realm nodes it is connected to now.
const computer = computed(() => {
  const info = nodeInfo.value
  if (!desktop || !info?.connections) return null
  const id = info.node.peer_id
  // Its own realm record first; a realm node's copy when its own has no name yet.
  const local = deviceNodes.value.find((node) => node.node_id === id)
  const name = computerName(local && givenName(local) ? local : (panelDevices.value.find((node) => node.node_id === id) ?? local))
  const peers = info.connections.filter((peer) => peer.status === 'connected').map((peer) => peer.peer_id)
  return { id, name, peers }
})

const sortedNodes = computed(() =>
  [...infraNodes.value].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.node_id.localeCompare(b.node_id),
  ),
)

// Online as the cards say it: the node is present in the realm.
const onlineCount = computed(() => cardNodes.value.filter((node) => node.present).length)
// Only metadata is copied automatically; the factor says nothing about data copies.
const metadataCopies = computed(() => {
  const factor = realmInfo.value?.metadata_replication.default_replication_factor
  if (factor === null) return 'Metadata on all eligible nodes'
  return factor === undefined ? null : `Metadata on ${factor} ${factor === 1 ? 'node' : 'nodes'}`
})

// Placement location aggregates over the live /info/realm data (aruna#269). Pure
// derivation of the already-served placement map: no gate, no assumed endpoint.
const locationAggregates = computed(() => aggregateByLocation(infraNodes.value))
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

const lastUpdatedLabel = computed(() =>
  lastUpdated.value
    ? formatClock(lastUpdated.value)
    : '-',
)

// The cards and their details come from the same realm snapshot as the map; in the desktop that
// is a realm node's, which knows the names and heartbeats the device's own copy lacks.
// This node's realm record. In the desktop it is this computer's own node, which listens here only.
const ownRecord = computed(() => (realmInfo.value?.nodes ?? []).find((node) => node.node_id === localPeerId.value) ?? null)
// The serving node's own kind decides; without its record only the desktop's own node is a device.
// A desktop that reaches a remembered realm API meanwhile is served by a realm node.
const { identity } = useDeviceStatus()
const ownDevice = computed(() =>
  ownRecord.value ? ownRecord.value.kind === 'user' : desktop && Boolean(localPeerId.value) && identity.value?.nodeId === localPeerId.value,
)
// Where tools reach the realm: a management node's public API, else the first one the realm names.
const realmApi = computed(() => {
  const management = panelInfra.value.find((node) => node.kind === 'management' && nodeApiBase(node))
  return (management && nodeApiBase(management)) || realmInfo.value?.management_urls?.[0] || null
})

const cardNodes = computed(() =>
  [...panelInfra.value].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.node_id.localeCompare(b.node_id)),
)
// The node named in the query opens in a dialog; links from elsewhere and the old node pages name it.
const openNodeId = computed(() => (typeof route.query.node === 'string' ? route.query.node : ''))
const nodeQuery = (id: string) => ({ query: { ...route.query, node: id } })
const openNode = (id: string) => void router.push(nodeQuery(id))
function closeNode() {
  const { node: _closed, ...query } = route.query
  void router.replace({ query })
}
</script>

<template>
  <div>
    <PageHeader title="Status" :docs="{ topic: 'realm-nodes-groups', section: 'Nodes and the realm' }">
      <template #description>
        <span class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span v-if="realm.description && realm.description !== realm.name">{{ realm.description }}</span>
          <span v-if="localPeerId" class="inline-flex items-center gap-1.5"><Server class="size-4" />Served by <RouterLink :to="nodeQuery(localPeerId)" class="hover:underline">{{ ownRecord ? nodeName(ownRecord) : 'this node' }}</RouterLink></span>
          <span class="inline-flex items-center gap-1.5">Realm id<InfoHint :label="realm.id" name="Realm id" /><CopyButton :value="realm.id" label="Copy realm id" /></span>
          <span class="inline-flex items-center gap-1.5 tabular-nums"><Clock class="size-4" />Updated {{ lastUpdatedLabel }}</span>
        </span>
      </template>
      <template #actions>
        <RefreshButton :busy="spinning" @click="onRefresh" />
      </template>
    </PageHeader>

    <div class="w-full space-y-8 px-4 py-6 sm:px-6">
      <template v-if="!painted">
        <SectionSkeleton :lines="3" />
        <SectionSkeleton :lines="2" />
        <ListSkeleton header :rows="5" label="Loading realm status" />
        <SectionSkeleton :lines="4" />
      </template>

      <template v-else>
      <Notice v-if="statusError" tone="warning" class="p-4 text-sm">
        Status refresh failed: {{ statusError }}
      </Notice>

      <Notice v-if="unreachableNodes.length" tone="error" class="p-4 text-sm">
        {{ unreachableNodes.length === 1 ? 'The browser API probe failed for 1 node' : `The browser API probe failed for ${unreachableNodes.length} nodes` }}:
        <span v-for="(node, index) in unreachableNodes" :key="node.node_id">
          <RouterLink :to="{ name: 'node', params: { nodeId: node.node_id } }" class="hover:underline"><NodeLabel :node-id="node.node_id" /></RouterLink><template v-if="index < unreachableNodes.length - 1">, </template>
        </span>
      </Notice>

      <Notice v-if="degradedNodes.length" tone="warning" class="p-4 text-sm">
        Degraded interfaces on {{ degradedNodes.length === 1 ? 'node' : 'nodes' }}:
        <span v-for="(node, index) in degradedNodes" :key="node.node_id">
          <RouterLink :to="{ name: 'node', params: { nodeId: node.node_id } }" class="hover:underline"><NodeLabel :node-id="node.node_id" /></RouterLink><template v-if="index < degradedNodes.length - 1">, </template>
        </span>
      </Notice>

      <div class="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <OverviewCell label="Nodes" :icon="Server">
          <template #value>{{ onlineCount }}/{{ cardNodes.length }}</template>
          <template #unit>online</template>
          <span v-if="onlineCount === cardNodes.length && cardNodes.length"><CircleCheck class="text-status-ok" />All reachable</span>
          <span v-else-if="cardNodes.length" class="text-status-warn"><TriangleAlert /><b>{{ cardNodes.length - onlineCount }}</b> offline</span>
          <span v-if="metadataCopies"><Copy />{{ metadataCopies }}</span>
        </OverviewCell>
        <OverviewCell label="Locations" :icon="MapPinned">
          <template #value>{{ formatNumber(mappedLocationCount) }}</template>
          <template #unit>{{ mappedLocationCount === 1 ? 'location' : 'locations' }}</template>
          <span v-for="place in locationAggregates.filter((a) => a.mapped).slice(0, 3)" :key="place.location"><MapPinned />{{ place.location }}, <b>{{ place.nodeCount }}</b> {{ place.nodeCount === 1 ? 'node' : 'nodes' }}</span>
        </OverviewCell>
        <OverviewCell v-if="deviceNodes.length" label="Devices" :icon="Laptop" info="Devices do not announce themselves; activity is what this node last heard from them.">
          <template #value>{{ formatNumber(deviceNodes.length) }}</template>
          <template #unit>enrolled</template>
          <span><Activity /><b>{{ activeDevices }}</b> active</span>
          <span v-if="offlineDevices"><Unplug /><b>{{ offlineDevices }}</b> offline</span>
          <span v-if="ownedDevices"><UserRound /><b>{{ ownedDevices }}</b> yours</span>
          <span v-if="deviceLastSeen"><Clock />Seen {{ deviceLastSeen }}</span>
        </OverviewCell>
        <OverviewCell v-if="usageInfo" label="This node" :icon="HardDrive" :to="localPeerId ? { name: 'node', params: { nodeId: localPeerId } } : undefined">
          <template #value>{{ formatBytes(usageInfo.stored_bytes ?? 0) }}</template>
          <template #unit>stored</template>
          <span><Files /><b>{{ formatNumber(usageInfo.objects) }}</b> objects</span>
          <span v-if="usageInfo.stored_blobs != null"><Copy /><b>{{ formatNumber(usageInfo.stored_blobs) }}</b> physical blob locations</span>
          <span><Package /><b>{{ formatNumber(usageInfo.buckets) }}</b> buckets</span>
        </OverviewCell>
      </div>

      <section v-if="currentUser" aria-labelledby="status-map-heading">
        <SectionHeading id="status-map-heading" title="Node map" :icon="Network" info="Pick a node to see its details." />
        <div class="relative h-[300px] overflow-hidden rounded-xl border border-border-subtle bg-background shadow-sm dark:shadow-none">
          <RealmTopology
            :nodes="panelInfra"
            :local-peer-id="(realmView?.info ?? nodeInfo)?.node.peer_id"
            :computer="computer"
            :highlight="openNodeId || null"
            @select="openNode"
          />
        </div>
      </section>

      <section aria-labelledby="status-nodes-heading">
        <SectionHeading id="status-nodes-heading" title="Nodes" :icon="Boxes" />
        <div v-if="cardNodes.length">
          <NodeCards
            :nodes="cardNodes"
            :devices="[]"
            :local-node-id="localPeerId"
            details
            :rename="rename"
            @details="openNode"
          />
        </div>
        <EmptyState v-else title="No nodes reported for this realm yet">
          <template #icon><Server class="size-6" /></template>
        </EmptyState>
      </section>

      <section aria-labelledby="status-locations-heading">
        <SectionHeading id="status-locations-heading" title="Locations" :icon="MapPinned" />
        <div class="surface px-5 py-4">
          <LocationAggregates :aggregates="locationAggregates" />
        </div>
      </section>

      <section v-if="nodeInfo" aria-labelledby="status-this-node-heading">
        <SectionHeading id="status-this-node-heading" title="This node" :icon="HardDrive">
          <template #actions>
            <!-- A healthy node needs no word; only a problem is named. -->
            <StatusPill
              v-if="statusProblem(nodeInfo.node.status)"
              :state="statusProblem(nodeInfo.node.status)!.word"
              :tone="statusProblem(nodeInfo.node.status)!.failed ? 'failed' : 'attention'"
            />
            <Button v-if="localPeerId" variant="outline" size="sm" as-child>
              <RouterLink :to="nodeQuery(localPeerId)"><Server class="h-3.5 w-3.5" /> Node details</RouterLink>
            </Button>
          </template>
        </SectionHeading>
        <div class="surface p-5">
          <LocalNodeDetails
            :info="nodeInfo"
            :public-api="ownRecord ? nodeApiBase(ownRecord) : null"
            :public-s3="ownRecord?.info?.urls.s3 ?? null"
            :device="ownDevice"
            :realm-api="ownDevice ? realmApi : null"
          />
        </div>
      </section>
      </template>
    </div>
    <NodeDialog v-if="openNodeId" :node-id="openNodeId" @close="closeNode" />
  </div>
</template>
