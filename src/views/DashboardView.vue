<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import DashboardScopeToggle from '@/components/dashboard/DashboardScopeToggle.vue'
import GroupQuotaCards from '@/components/dashboard/GroupQuotaCards.vue'
import MyStatsCards from '@/components/dashboard/MyStatsCards.vue'
import NodeCards from '@/components/dashboard/NodeCards.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import WebStart from '@/components/dashboard/WebStart.vue'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { RealmView } from '@/composables/aruna/realm'
import type { RealmNodeInfo } from '@/lib/api'
import { givenName } from '@/components/nodes/node-display'
import { ArrowRight, Plus } from '@lucide/vue'
import { RouterLink, useRouter } from 'vue-router'
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useNodeNames } from '@/composables/useNodeNames'
import { useDatabases } from '@/composables/useDatabases'
import { computerName } from '@/composables/useRealmNodes'
import { useDashboardScope } from '@/composables/useDashboardScope'
import { useNotifications } from '@/composables/useNotifications'
import { useRefresh } from '@/composables/useRefresh'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { isDesktop } from '@/lib/desktop'
import { POLL_SLOW_MS, follow, onWake } from '@/lib/poll'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'
import { countText, useRealmBucketCount } from '@/composables/useBucketCount'

// The desktop adds its own parts; the web build never loads them.
const HomeCards = defineAsyncComponent({
  loader: () => import('@/components/desktop/HomeCards.vue'),
  onError: asyncChunkError,
})
const DeviceRow = defineAsyncComponent({
  loader: () => import('@/components/desktop/DeviceRow.vue'),
  onError: asyncChunkError,
})
const desktop = isDesktop()

const router = useRouter()
const { currentUser, myGroups, nodeInfo, realmInfo, usageInfo, loading, bootstrapped, sessionEpoch, refresh, refreshedEpoch, loadInfo, loadRealmView, isRealmAdmin } = useAruna()
const { renameNode } = useNodeNames()
const { authPending } = useAuth()
const { dashboardRevision } = useNotifications()
const { scope, setScope } = useDashboardScope()
const refreshing = ref(false)
const quotaRevision = ref(0)
// The info poll reads the cheap group figures again, never every bucket.
const cardsRevision = ref(0)
let refreshQueued = false
// A round queued only by a session change, which the running round may have loaded already.
let epochOnly = true
// The first round loads what the cards load on their own, so it does not ask them again.
let cardsShown = false
// On the desktop the API base is the device node, which sees no live heartbeats and no
// connections between realm nodes, so the nodes panel reads them from a realm node.
const realmView = ref<RealmView | null>(null)
let realmViewGeneration = 0

watch(sessionEpoch, () => {
  realmViewGeneration++
  realmView.value = null
}, { flush: 'sync' })

// The database list is shared for the session; a dashboard refresh reads it once more, so a group
// joined since then counts its databases too.
const databases = useDatabases()

async function refreshDashboard() {
  if (refreshing.value) {
    refreshQueued = true
    return
  }
  if (currentUser.value) void databases.reload()
  refreshing.value = true
  try {
    let again = false
    do {
      // A session the running round already loaded needs no second round.
      const loaded = again && epochOnly && refreshedEpoch() === sessionEpoch.value
      refreshQueued = false
      epochOnly = true
      again = true
      if (!loaded) await refresh()
    } while (refreshQueued)
  } finally {
    refreshing.value = false
    if (cardsShown) {
      quotaRevision.value++
      cardsRevision.value++
    }
    cardsShown = true
  }
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refreshDashboard)
const spinning = computed(() => refreshBusy.value || refreshing.value)

// The dashboard has one critical bootstrap round. Hold its sections in a
// single skeleton until the shared session and identity data have settled;
// later refreshes update the rendered content in place. A session change starts
// a fresh first paint through the epoch key.
const dashboardSettled = () => bootstrapped.value && !loading.value && !authPending.value
const painted = useFirstPaint(
  dashboardSettled,
  () => String(sessionEpoch.value),
)

// Opening the dashboard reads again. The view is mounted fresh on every visit,
// so a skip here left the node panel and the totals showing the last visit's
// numbers until the 15s poll landed or someone pressed Refresh.
watch([dashboardRevision, sessionEpoch], ([revision], previous) => {
  if (refreshing.value) epochOnly &&= revision === previous?.[0]
  void refreshDashboard()
}, { immediate: true })

// Node heartbeats and usage republish without bumping the SSE revision; poll
// the light info endpoints so the realm nodes panel stays current, and read the
// group quota figures again. A failed read must not end the poll, so it is swallowed.
const pollInfo = () =>
  loadInfo()
    .catch(() => undefined)
    .then(() => {
      cardsRevision.value++
    })
const stopFollow = follow(pollInfo, () => POLL_SLOW_MS, () => refreshing.value)
const stopWake = onWake(() => void pollInfo())
onUnmounted(() => {
  stopFollow()
  stopWake()
})

// Only a session or realm change drops a running lookup; a periodic refresh shares it.
watch(() => realmInfo.value?.realm_id, () => {
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
const panelRealm = computed(() => realmView.value?.realm ?? realmInfo.value)

// Devices (kind 'user') run on their owner's computer, not on realm
// infrastructure: they are summarized only, never listed or aggregated.
const infraNodes = computed(() => (panelRealm.value?.nodes ?? []).filter((node) => node.kind !== 'user'))
const deviceNodes = computed(() => (panelRealm.value?.nodes ?? []).filter((node) => node.kind === 'user'))

// This computer by its own /system/info, the device node, named by its own realm record first and
// by a realm node's copy when its own has no name yet.
const ownRecord = (nodes?: RealmNodeInfo[]) => nodes?.find((node) => node.node_id === nodeInfo.value?.node.peer_id)
const deviceRecord = computed(() => {
  const local = ownRecord(realmInfo.value?.nodes)
  return local && givenName(local) ? local : (ownRecord(panelRealm.value?.nodes) ?? local)
})
const deviceName = computed(() => computerName(deviceRecord.value))
// Only the owner names a device, so the row offers renaming only for the signed-in owner's own.
const renameId = computed(() => {
  const record = deviceRecord.value
  return record?.kind === 'user' && record.owner && record.owner === currentUser.value?.id ? record.node_id : null
})

const onlineNodes = computed(() => infraNodes.value.filter((node) => node.present).length)

// Imports explain a busy node; each node's heartbeat counts them in the realm snapshot the cards show.
// A node without a heartbeat count adds nothing known, so the sum is then a lower bound.
const importsLine = computed(() => {
  const counts = infraNodes.value.map((node) => node.info?.utilization?.imports_running)
  const running = counts.reduce<number>((sum, count) => sum + (count ?? 0), 0)
  const atLeast = counts.some((count) => count === undefined) ? 'at least ' : ''
  return running ? `Imports running: ${atLeast}${formatCount(running)} ${running === 1 ? 'job' : 'jobs'}` : null
})
const replication = computed(() => {
  const factor = realmInfo.value?.metadata_replication.default_replication_factor
  return factor === null ? 'Replication on all eligible nodes' : factor === undefined ? null : `Replication ×${factor}`
})

// Realm-wide total of live datasets, not a per-caller figure. The loaded
// catalog is a paged subset, so it must never stand in as the realm total.
const realmDocuments = computed(() => usageInfo.value?.metadata_documents ?? null)
const publicOverview = computed(() => realmInfo.value?.public_overview)

// Realm-wide totals the same /system/usage response carries; the top-level
// counters next to them belong to this node and live on the Status page.
const realmTotals = computed(() => usageInfo.value?.realm ?? null)
const realmBuckets = useRealmBucketCount(realmTotals)
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)
// No database count here: the list holds only the databases the caller may read, not the realm's.
const realmDataLine = computed(() => {
  const totals = realmTotals.value
  if (!totals) return ''
  const buckets = realmBuckets.value ?? { count: totals.buckets, exact: true }
  return `${countText(buckets, formatCount)} ${plural(buckets.exact ? buckets.count : 2, 'bucket', 'buckets')}`
})
// A guest sees the public counts; unknown stays unknown, never zero.
const realmDatasets = computed(() => (currentUser.value ? realmDocuments.value : publicOverview.value?.live_datasets) ?? null)
const realmNodesText = computed(() => {
  if (infraNodes.value.length) return { count: onlineNodes.value, word: 'online' }
  const configured = publicOverview.value?.nodes_configured
  return configured == null ? null : { count: configured, word: '' }
})

// While a stored session restores, keep the copy neutral instead of flashing
// the guest greeting and its sign-in hint.
const pageTitle = computed(() =>
  currentUser.value
    ? `Welcome back, ${currentUser.value.name.split(' ')[0]}.`
    : authPending.value
      ? 'Welcome back.'
      : 'Aruna data portal',
)
const pageDescription = computed(() =>
  currentUser.value || authPending.value
    ? desktop
      ? 'Your realm and this computer at a glance.'
      : ''
    : 'You are browsing public data as a guest. Sign in to create datasets and manage your groups.',
)
</script>

<template>
  <div>
    <PageHeader
      :title="pageTitle"
      :description="pageDescription"
      :docs="{ topic: 'portal-tour', section: 'Start at the dashboard' }"
    >
      <template #actions>
        <RefreshButton :busy="spinning" size="default" @click="onRefresh" />
        <Button v-if="currentUser" variant="outline" @click="router.push({ name: 'dataset-new' })">
          <Plus class="h-4 w-4" /> Create dataset
        </Button>
        <Button :variant="currentUser ? 'default' : 'outline'" as-child>
          <RouterLink :to="{ name: 'datasets' }">
            Open datasets <ArrowRight class="h-4 w-4" />
          </RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-6">
      <div v-if="!painted" class="space-y-5" aria-busy="true">
        <span class="sr-only">Loading dashboard</span>
        <Skeleton class="h-44 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <template v-else>
      <SignInPanel v-if="!currentUser" />

      <!-- First steps in one line; the tours and tutorials live in Docs. -->
      <WebStart v-if="!desktop && currentUser && !authPending" />
      <HomeCards v-if="desktop && currentUser" />

      <!-- One card for the figures: the stored scope decides whose, the realm cell is the same for both. -->
      <section class="surface overflow-hidden" aria-labelledby="overview-heading">
        <header class="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h2 id="overview-heading" class="font-display text-[15px] font-semibold text-foreground">Overview</h2>
          <span v-if="importsLine" class="mr-auto text-xs text-muted-foreground">{{ importsLine }}</span>
          <DashboardScopeToggle v-if="currentUser" :model-value="scope" @update:model-value="setScope" />
        </header>
        <div class="mt-3 grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <template v-if="currentUser && scope === 'personal'">
            <MyStatsCards v-if="myGroups.length" :refresh-revision="quotaRevision" />
            <div v-else class="bg-card px-5 py-4 lg:col-span-3"><EmptyState compact title="You do not belong to any groups yet." /></div>
          </template>
          <template v-else-if="!bootstrapped">
            <div v-for="n in 3" :key="n" class="bg-card px-5 py-4"><Skeleton class="h-16" /></div>
          </template>
          <template v-else>
            <template v-if="currentUser">
              <OverviewCell label="Storage">
                <template v-if="realmTotals" #value>
                  <b>{{ formatBytes(realmTotals.logical_bytes) }}</b> stored
                  <b class="ml-2">{{ formatBytes(realmTotals.referenced_bytes) }}</b> referenced
                </template>
                <template v-else #value>Unknown</template>
                Stored counts against quotas. Referenced data stays at its source.
              </OverviewCell>
              <OverviewCell label="Data">
                <template v-if="realmTotals" #value><b>{{ formatCount(realmTotals.objects) }}</b> {{ plural(realmTotals.objects, 'object', 'objects') }}</template>
                <template v-else #value>Unknown</template>
                {{ realmDataLine }}
              </OverviewCell>
            </template>
            <OverviewCell label="Work" :class="currentUser ? '' : 'sm:col-span-1 lg:col-span-3'">
              <template v-if="realmDatasets !== null" #value><b>{{ formatCount(realmDatasets) }}</b> {{ plural(realmDatasets, 'dataset', 'datasets') }}</template>
              <template v-else #value>Unknown</template>
            </OverviewCell>
          </template>
          <OverviewCell label="Realm">
            <template v-if="realmNodesText" #value>
              <b>{{ formatCount(realmNodesText.count) }}</b> {{ plural(realmNodesText.count, 'node', 'nodes') }} {{ realmNodesText.word }}
            </template>
            <template v-else #value>Unknown</template>
            {{ replication ? `${replication} ` : '' }}
            <RouterLink :to="{ name: 'status' }" class="text-primary hover:underline">Status</RouterLink>
          </OverviewCell>
        </div>
        <div v-if="currentUser && infraNodes.length" class="border-t border-border px-5 py-4">
          <NodeCards :nodes="infraNodes" :devices="deviceNodes" :rename="isRealmAdmin ? renameNode : undefined" />
        </div>
        <DeviceRow
          v-if="desktop && currentUser"
          :name="deviceName"
          :node-id="renameId"
          :value="deviceRecord?.display_name ?? null"
        />
      </section>

      <GroupQuotaCards v-if="currentUser && myGroups.length" :refresh-revision="cardsRevision" />
      </template>
    </div>

  </div>
</template>
