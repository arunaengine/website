<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import LocalNodeDetails from '@/components/nodes/LocalNodeDetails.vue'
import NodeDetailPanel from '@/components/nodes/NodeDetailPanel.vue'
import { connectionLabel, connectionVariant, isDegradedStatus, kindVariant, statusVariant, type BadgeVariant } from '@/components/nodes/node-display'
import { nodeApiBase, probeNode, type NodeProbe } from '@/components/nodes/node-probe'
import { useAruna } from '@/composables/useAruna'
import { formatBytes, formatNumber, truncateMiddle } from '@/lib/utils'
import type { RealmNodeInfo } from '@/lib/api'
import { ApiError } from '@/lib/api'
import { Boxes, ChevronRight, Globe2, HardDrive, RefreshCw } from 'lucide-vue-next'

const route = useRoute()
const { realm, realmInfo, nodeInfo, usageInfo, loadInfo } = useAruna()

const REFRESH_INTERVAL_MS = 10_000

const expandedId = ref('')
const statusError = ref<string | null>(null)
const lastUpdated = ref<Date | null>(null)
const refreshing = ref(false)
const probes = ref<Record<string, NodeProbe>>({})
let timer: number | undefined

async function refreshStatus() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await loadInfo()
    statusError.value = null
    lastUpdated.value = new Date()
    await probeRealmNodes()
  } catch (err) {
    statusError.value = err instanceof ApiError || err instanceof Error ? err.message : String(err)
  } finally {
    refreshing.value = false
  }
}

async function probeRealmNodes() {
  const targets = (realmInfo.value?.nodes ?? [])
    .filter((node) => !isLocal(node))
    .map((node) => ({ id: node.node_id, base: nodeApiBase(node) }))
    .filter((target): target is { id: string; base: string } => !!target.base)
  const results = await Promise.all(
    targets.map(async ({ id, base }) => [id, await probeNode(base)] as const),
  )
  probes.value = Object.fromEntries(results)
}

onMounted(() => {
  void refreshStatus()
  timer = window.setInterval(() => void refreshStatus(), REFRESH_INTERVAL_MS)
})
onUnmounted(() => window.clearInterval(timer))

const localPeerId = computed(() => nodeInfo.value?.node.peer_id ?? '')

function isLocal(node: RealmNodeInfo): boolean {
  return node.kind === 'local' || (!!localPeerId.value && node.node_id === localPeerId.value)
}

// The local node is reported through the already-loaded /info data instead of
// a second probe against the same endpoint.
function probeFor(node: RealmNodeInfo): NodeProbe | undefined {
  if (isLocal(node)) {
    return nodeInfo.value
      ? { state: 'ok', info: nodeInfo.value, usage: usageInfo.value }
      : undefined
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

const kindOrder: Record<RealmNodeInfo['kind'], number> = { local: 0, management: 1, server: 2, user: 3 }

const sortedNodes = computed(() =>
  [...(realmInfo.value?.nodes ?? [])].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.node_id.localeCompare(b.node_id),
  ),
)

const connectedCount = computed(
  () => sortedNodes.value.filter((node) => node.connection_status === 'connected').length,
)

const unreachableNodes = computed(() =>
  sortedNodes.value.filter(
    (node) =>
      probeFor(node)?.state === 'unreachable' ||
      (node.configured && node.connection_status !== 'connected'),
  ),
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
    : '—',
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
    <PageHeader title="Status" description="Realm topology and local node health, refreshed every 10 seconds.">
      <template #actions>
        <span class="text-[11px] tabular-nums text-muted-foreground">Updated {{ lastUpdatedLabel }}</span>
        <Button variant="outline" size="sm" :disabled="refreshing" @click="refreshStatus">
          <RefreshCw class="h-3.5 w-3.5" /> Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="container max-w-[1100px] space-y-6 py-8">
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
        {{ unreachableNodes.length === 1 ? '1 configured node is' : `${unreachableNodes.length} configured nodes are` }}
        unreachable: <span class="font-mono text-xs">{{ nodeIdList(unreachableNodes) }}</span>
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
              {{ connectedCount }} / {{ sortedNodes.length }} nodes connected
            </Badge>
            <Badge variant="outline" class="tabular-nums">
              replication ×{{ realmInfo?.metadata_replication.default_replication_factor ?? 1 }}
            </Badge>
          </div>
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
