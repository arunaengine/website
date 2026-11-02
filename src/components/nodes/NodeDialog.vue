<script setup lang="ts">
// One realm node in a dialog on the Status page: its name and state, type, place, stored data, load
// and runs as stat cards, its details, the buckets it holds and its recent runs. The addresses and
// probes sit under For developers. Every link to a node opens it.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import RecentRunsCard from '@/components/dashboard/RecentRunsCard.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconTile from '@/components/ui/IconTile.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import NodeDetailPanel from '@/components/nodes/NodeDetailPanel.vue'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { nodeActivity, nodeName, nodeOnline } from '@/components/nodes/node-display'
import { nodeApiBase, probeNode, type NodeProbe } from '@/components/nodes/node-probe'
import { useAruna } from '@/composables/useAruna'
import { useListedUsage } from '@/composables/useBucketUsage'
import { useDatabases } from '@/composables/useDatabases'
import { useNodeNames } from '@/composables/useNodeNames'
import { computerName, useRealmNodes } from '@/composables/useRealmNodes'
import { useRealmSnapshot } from '@/composables/useRealmSnapshot'
import { useRecentRuns } from '@/composables/useRecentRuns'
import { useRefresh } from '@/composables/useRefresh'
import type { BucketSearchHit } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { LOCATION_AFFINITY_KEY } from '@/lib/placement'
import { isActiveTesState } from '@/lib/tes'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { Boxes, ChevronRight, CircleCheck, Cpu, Database, Download, HardDrive, Info, Laptop, LoaderCircle, MapPin, Package, Server, Workflow } from '@lucide/vue'

const props = defineProps<{ nodeId: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const nodeId = computed(() => props.nodeId)
const { authToken, currentUser, myGroups, nodeInfo, usageInfo, isRealmAdmin, searchBuckets, sessionEpoch, loadInfo } = useAruna()
const { realm } = useRealmSnapshot()
const { isLocalNode, localNodeId } = useRealmNodes()
const { renameNode, renameDevice } = useNodeNames()

const node = computed(() => realm.value?.nodes?.find((entry) => entry.node_id === nodeId.value) ?? null)
const isLocal = computed(() => nodeInfo.value?.node.peer_id === nodeId.value)
const name = computed(() => {
  const record = node.value
  if (!record) return 'Node'
  return record.kind === 'user' && isLocal.value ? computerName(record) : nodeName(record)
})

// An admin names any node; the owner names their own device.
const rename = computed(() => {
  const record = node.value
  if (!record) return null
  if (isRealmAdmin.value) return (next: string | null) => renameNode(record.node_id, next)
  if (record.kind === 'user' && record.owner && record.owner === currentUser.value?.id) return (next: string | null) => renameDevice(record.node_id, next)
  return null
})

const location = computed(() => {
  const value = node.value?.info?.labels?.[LOCATION_AFFINITY_KEY] || node.value?.placement?.location || ''
  return value && value !== 'default' ? value : null
})
const cpu = computed(() => {
  const permille = node.value?.info?.utilization.load_permille
  return permille === undefined ? null : Math.round(permille / 10)
})
const TYPE: Record<string, string> = { management: 'Management node', server: 'Storage node', user: 'Device' }
const place = computed(() => {
  if (node.value?.kind === 'user' && isLocal.value) return 'This computer'
  return node.value?.place?.trim() || location.value
})
// When it was last heard of: a device by its last contact, a node by its heartbeat.
const lastSeen = computed(() => {
  const ms = node.value?.kind === 'user' ? node.value.last_seen_ms : node.value?.info?.utilization.heartbeat_at_ms
  return ms ? relativeTime(new Date(ms).toISOString()) : null
})
const executors = computed(() =>
  [...new Set((node.value?.info?.executors ?? []).map((executor) => executor.kind))]
    .map((kind) => `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)
    .join(', '),
)
const details = computed<Detail[]>(() => {
  const record = node.value
  if (!record) return []
  return [
    { label: 'Type', value: TYPE[record.kind] },
    ...(place.value ? [{ label: 'Location', value: place.value }] : []),
    { key: 'id', label: 'Node id', value: truncateMiddle(record.node_id), mono: true },
    ...(executors.value ? [{ label: 'Executors', value: executors.value }] : []),
    ...(probe.value?.info?.api_version ? [{ label: 'Version', value: probe.value.info.api_version }] : []),
    ...(lastSeen.value ? [{ label: 'Last seen', value: lastSeen.value }] : []),
  ]
})

// A refresh reads the realm, the node's own answer, its buckets and its runs again.
const revision = ref(0)
const recentRuns = useRecentRuns()
// A stored session may restore after the page opened.
watch(currentUser, (user) => {
  if (user) void recentRuns.load()
}, { immediate: true })
const { busy: refreshBusy, refresh: onRefresh } = useRefresh(async () => {
  revision.value++
  await Promise.all([loadInfo(), currentUser.value ? recentRuns.load() : undefined])
})
// The loaded window of recent runs, so the count says "recent", never all.
const nodeRuns = computed(() => recentRuns.runs.value.filter((run) => (run.nodeId ?? localNodeId.value) === nodeId.value))
const runsLine = computed(() => {
  if (recentRuns.state.value !== 'ready') return null
  const running = nodeRuns.value.filter((run) => isActiveTesState(run.task.state)).length
  return { running, completed: nodeRuns.value.filter((run) => run.task.state === 'COMPLETE').length, total: nodeRuns.value.length }
})

// The serving node answers from its own /info; any other node is asked directly.
const probe = ref<NodeProbe | null>(null)
let probeRound = 0
watch([nodeId, () => (node.value ? nodeApiBase(node.value) : null), isLocal, revision], async ([, base, local]) => {
  const mine = ++probeRound
  probe.value = null
  if (local) {
    probe.value = nodeInfo.value ? { state: 'ok', info: nodeInfo.value, usage: usageInfo.value ?? null } : null
    return
  }
  if (!base) return
  const answer = await probeNode(base, authToken.value)
  if (mine === probeRound) probe.value = answer
}, { immediate: true })

// The buckets this node holds that the signed-in user may read; the realm search has no node
// filter, so a few pages are read and the rest counts as "at least", as does a node that did
// not answer.
const MAX_PAGES = 5
const buckets = ref<BucketSearchHit[] | null>(null)
const moreBuckets = ref(false)
const unanswered = ref(false)
let bucketRound = 0
watch([nodeId, sessionEpoch, currentUser, revision], async () => {
  const mine = ++bucketRound
  buckets.value = null
  unanswered.value = false
  if (!currentUser.value) return
  const found: BucketSearchHit[] = []
  let cursor: string | undefined
  let pages = 0
  let failed = false
  try {
    do {
      const page = await searchBuckets('', { limit: 50, cursor })
      if (mine !== bucketRound) return
      found.push(...page.hits.filter((hit) => hit.node_id === nodeId.value))
      failed ||= page.nodes_failed > 0
      cursor = page.next_cursor ?? undefined
      pages++
    } while (cursor && pages < MAX_PAGES)
  } catch {
    if (mine === bucketRound) buckets.value = null
    return
  }
  buckets.value = found
  unanswered.value = failed
  moreBuckets.value = Boolean(cursor) || failed
}, { immediate: true })
const databases = useDatabases()
// A stored session may restore after the page opened, and the list needs it.
watch(currentUser, (user) => {
  if (user) databases.ensure()
}, { immediate: true })
// A database by the realm's database list, as the Data view's bucket list finds it.
const databaseOf = (hit: BucketSearchHit) => {
  const row = databases.rows.value.find((entry) => entry.bucket === hit.bucket && entry.places.some((place) => place.nodeId === hit.node_id))
  return row ? { title: row.title ?? null } : null
}
const usage = useListedUsage()
const usageNode = (hit: BucketSearchHit) => (isLocalNode(hit.node_id) ? null : hit.node_id)
watch(buckets, (hits) => usage.ensure((hits ?? []).map((hit) => ({ bucket: hit.bucket, nodeId: usageNode(hit) }))))
const groupName = (hit: BucketSearchHit) => hit.group_name ?? myGroups.value.find((group) => group.id === hit.group_id)?.name ?? null
const bucketLink = (hit: BucketSearchHit) => ({
  name: 'bucket',
  params: { bucketId: hit.bucket },
  query: { group: hit.group_id, ...(isLocalNode(hit.node_id) ? {} : { node: hit.node_id }) },
})
</script>

<template>
  <DetailDialog :open="true" @update:open="(open) => open || emit('close')">
    <template #header>
      <div class="min-w-0">
        <DialogTitle class="inline-flex flex-wrap items-center gap-2.5 leading-normal">
          {{ name }}
          <template v-if="node">
            <StatusMark v-if="nodeOnline(node)" label="Online" />
            <StatusMark v-else label="Offline" offline />
          </template>
        </DialogTitle>
        <p v-if="node" class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span class="inline-flex items-center gap-1.5"><component :is="node.kind === 'user' ? Laptop : Server" class="size-4" />{{ TYPE[node.kind] }}</span>
          <span v-if="place" class="inline-flex items-center gap-1.5"><MapPin class="size-4" />{{ place }}</span>
          <span v-if="nodeActivity(node)" class="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-aruna-aqua"><Download class="h-3 w-3" />{{ nodeActivity(node) }}</span>
        </p>
      </div>
    </template>
    <template #actions>
      <RefreshButton :busy="refreshBusy" @click="onRefresh" />
      <!-- A draft belongs to one node and one session; another node starts a fresh editor. -->
      <NodeNameEdit v-if="node && rename" :key="`${sessionEpoch}/${node.node_id}`" :name="name" :value="node.display_name" :save="rename" outline><span class="sr-only">{{ name }}</span></NodeNameEdit>
    </template>

    <div class="space-y-8">
      <EmptyState v-if="!node" title="This node is not in the realm's node list." />
      <template v-else>
        <div class="grid gap-3 sm:gap-4" :class="recentRuns.state.value === 'off' ? 'md:grid-cols-2' : 'md:grid-cols-3'">
          <OverviewCell label="Stored" :icon="HardDrive">
            <template #value>{{ node.info ? formatBytes(node.info.utilization.storage_bytes_used) : 'Unknown' }}</template>
            <span v-if="buckets !== null"><Package /><b>{{ moreBuckets ? 'at least ' : '' }}{{ formatCount(buckets.length) }}</b> {{ buckets.length === 1 ? 'bucket' : 'buckets' }}</span>
          </OverviewCell>
          <OverviewCell label="CPU" :icon="Cpu" info="The 1-minute load of the node's CPU cores.">
            <template #value>{{ cpu !== null ? `${cpu}%` : 'Unknown' }}</template>
          </OverviewCell>
          <OverviewCell v-if="recentRuns.state.value !== 'off'" label="Runs" :icon="Workflow" info="Runs among your recent ones that ran on this node.">
            <template #value>{{ runsLine ? formatCount(runsLine.total) : 'Reading' }}</template>
            <template v-if="runsLine" #unit>recent</template>
            <span v-if="runsLine?.running"><LoaderCircle /><b>{{ formatCount(runsLine.running) }}</b> running</span>
            <span v-else-if="runsLine?.total">
              <CircleCheck v-if="runsLine.completed === runsLine.total" class="text-status-ok" /><b>{{ runsLine.completed }}/{{ runsLine.total }}</b> completed
            </span>
            <span v-else-if="runsLine">No runs yet</span>
          </OverviewCell>
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <section class="flex flex-col" aria-labelledby="node-details-heading">
            <SectionHeading id="node-details-heading" title="Details" :icon="Info" />
            <div class="surface flex-1 p-5">
              <DetailList :items="details">
                <template #id="{ item }">
                  <span class="inline-flex items-center gap-1.5" :title="node.node_id">{{ item.value }}<CopyButton :value="node.node_id" label="Copy node id" /></span>
                </template>
              </DetailList>
            </div>
          </section>

          <section v-if="currentUser" class="flex flex-col" aria-labelledby="node-buckets-heading">
            <SectionHeading id="node-buckets-heading" title="Buckets" :icon="Boxes" />
            <div class="surface flex-1 overflow-hidden">
              <div>
                <p v-if="buckets === null" class="px-5 py-4 text-xs text-muted-foreground">Reading the buckets you can open…</p>
                <p v-else-if="!buckets.length && !moreBuckets" class="px-5 py-4 text-xs text-muted-foreground">None that you can open.</p>
                <p v-else-if="!buckets.length && unanswered" class="px-5 py-4 text-xs text-muted-foreground">Not every node answered, so its buckets may be missing.</p>
                <p v-else-if="!buckets.length" class="px-5 py-4 text-xs text-muted-foreground">None among the buckets read so far.</p>
                <ul v-else class="divide-y divide-border-subtle">
                  <li v-for="hit in buckets" :key="`${hit.group_id}/${hit.bucket}`">
                    <RouterLink :to="bucketLink(hit)" class="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <IconTile :icon="databaseOf(hit) ? Database : Package" :tone="databaseOf(hit) ? 'royal' : 'muted'" size="sm" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium text-foreground">{{ hit.bucket }}</span>
                        <span v-if="databaseOf(hit)?.title || usage.textOf(hit.bucket, usageNode(hit)) || groupName(hit)" class="block truncate text-xs text-muted-foreground">
                          {{ [databaseOf(hit)?.title, usage.textOf(hit.bucket, usageNode(hit)) ?? groupName(hit)].filter(Boolean).join(', ') }}
                        </span>
                      </span>
                      <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
                    </RouterLink>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <RecentRunsCard v-if="currentUser && recentRuns.state.value !== 'off'" :runs="nodeRuns" :state="recentRuns.state.value" hide-node />

        <!-- Placement, labels, addresses and probes for whoever needs them. -->
        <details class="surface group">
          <summary class="cursor-pointer select-none px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">For developers</summary>
          <div class="border-t border-border-subtle p-5">
            <NodeDetailPanel :node="node" :is-local="isLocal" :probe="probe" hide-name />
          </div>
        </details>
      </template>
    </div>
  </DetailDialog>
</template>
