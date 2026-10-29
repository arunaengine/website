<script setup lang="ts">
// One realm node: its name, state, role, place, load and storage, what it runs, the buckets it holds
// and its addresses. Reached from the landing view's map and table and from the Status page.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import NodeDetailPanel from '@/components/nodes/NodeDetailPanel.vue'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { nodeActivity, nodeName, nodeOnline, roleLabel } from '@/components/nodes/node-display'
import { nodeApiBase, probeNode, type NodeProbe } from '@/components/nodes/node-probe'
import { useAruna } from '@/composables/useAruna'
import { useNodeNames } from '@/composables/useNodeNames'
import { computerName, useRealmNodes } from '@/composables/useRealmNodes'
import { useRealmSnapshot } from '@/composables/useRealmSnapshot'
import type { BucketSearchHit } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { LOCATION_AFFINITY_KEY } from '@/lib/placement'
import { formatBytes } from '@/lib/utils'
import { Download } from '@lucide/vue'

const route = useRoute()
const nodeId = computed(() => String(route.params.nodeId ?? ''))
const { currentUser, nodeInfo, usageInfo, isRealmAdmin, searchBuckets, sessionEpoch } = useAruna()
const { realm } = useRealmSnapshot()
const { isLocalNode } = useRealmNodes()
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

// The serving node answers from its own /info; any other node is asked directly.
const probe = ref<NodeProbe | null>(null)
let probeRound = 0
watch([nodeId, () => (node.value ? nodeApiBase(node.value) : null), isLocal], async ([, base, local]) => {
  const mine = ++probeRound
  probe.value = null
  if (local) {
    probe.value = nodeInfo.value ? { state: 'ok', info: nodeInfo.value, usage: usageInfo.value ?? null } : null
    return
  }
  if (!base) return
  const answer = await probeNode(base)
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
watch([nodeId, sessionEpoch, currentUser], async () => {
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
const bucketLink = (hit: BucketSearchHit) => ({
  name: 'bucket',
  params: { bucketId: hit.bucket },
  query: { group: hit.group_id, ...(isLocalNode(hit.node_id) ? {} : { node: hit.node_id }) },
})
</script>

<template>
  <div>
    <PageHeader
      :title="name"
      :description="node ? [roleLabel[node.kind], location].filter(Boolean).join(', ') : ''"
      :docs="{ topic: 'realm-nodes-groups', section: 'Nodes and the realm' }"
    >
      <template v-if="node && rename" #actions>
        <!-- A draft belongs to one node and one session; another node starts a fresh editor. -->
        <NodeNameEdit :key="`${sessionEpoch}/${node.node_id}`" :name="name" :value="node.display_name" :save="rename"><span class="sr-only">{{ name }}</span></NodeNameEdit>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-6">
      <EmptyState v-if="!node" title="This node is not in the realm's node list." />
      <template v-else>
        <section class="surface p-5" aria-label="Node facts">
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div>
              <dt class="text-xs text-muted-foreground">State</dt>
              <dd class="mt-1 text-sm" :class="nodeOnline(node) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
                {{ nodeOnline(node) ? 'online' : 'offline' }}
              </dd>
            </div>
            <div v-if="location">
              <dt class="text-xs text-muted-foreground">Location</dt>
              <dd class="mt-1"><Badge variant="outline" size="sm">{{ location }}</Badge></dd>
            </div>
            <div v-if="node.place || node.coordinates">
              <dt class="text-xs text-muted-foreground">Place</dt>
              <dd class="mt-1 text-sm text-foreground">
                {{ node.place ?? '' }}
                <span v-if="node.coordinates" class="block font-mono text-[11px] text-muted-foreground">
                  {{ node.coordinates.lat.toFixed(4) }}, {{ node.coordinates.lon.toFixed(4) }}
                </span>
              </dd>
            </div>
            <div v-if="node.info">
              <dt class="text-xs text-muted-foreground">Stored</dt>
              <dd class="mt-1 text-sm text-foreground">{{ formatBytes(node.info.utilization.storage_bytes_used) }}</dd>
            </div>
            <div v-if="cpu !== null">
              <dt class="text-xs text-muted-foreground">CPU</dt>
              <dd class="mt-1 text-sm text-foreground">{{ cpu }}%</dd>
            </div>
            <div v-if="node.info">
              <dt class="text-xs text-muted-foreground">Running</dt>
              <dd class="mt-1 text-sm">
                <Badge v-if="nodeActivity(node)" variant="sky" size="sm" class="gap-1"><Download class="h-3 w-3" /> {{ nodeActivity(node) }}</Badge>
                <span v-else-if="node.info.utilization.jobs_running === undefined" class="text-muted-foreground">not reported</span>
                <span v-else class="text-muted-foreground">nothing</span>
              </dd>
            </div>
            <div v-if="probe?.info?.api_version">
              <dt class="text-xs text-muted-foreground">Version</dt>
              <dd class="mt-1 font-mono text-xs text-foreground">{{ probe.info.api_version }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="currentUser" class="surface p-5" aria-label="Buckets on this node">
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets on this node</h2>
          <p v-if="buckets === null" class="mt-1 text-xs text-muted-foreground">Reading the buckets you can open…</p>
          <p v-else-if="!buckets.length && !moreBuckets" class="mt-1 text-xs text-muted-foreground">None that you can open.</p>
          <p v-else-if="!buckets.length && unanswered" class="mt-1 text-xs text-muted-foreground">Not every node answered, so its buckets may be missing.</p>
          <template v-else>
            <ul class="mt-2 flex flex-wrap gap-2 text-sm">
              <li v-for="hit in buckets" :key="`${hit.group_id}/${hit.bucket}`">
                <RouterLink :to="bucketLink(hit)" class="text-primary hover:underline">{{ hit.bucket }}</RouterLink>
              </li>
            </ul>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ moreBuckets ? 'At least' : '' }} {{ formatCount(buckets.length) }} {{ buckets.length === 1 ? 'bucket' : 'buckets' }} you can open.
            </p>
          </template>
        </section>

        <section class="surface p-5" aria-label="Node details">
          <NodeDetailPanel :node="node" :is-local="isLocal" :probe="probe" hide-name />
        </section>
      </template>
    </div>
  </div>
</template>
