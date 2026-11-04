<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import ViewToggle from '@/components/ui/ViewToggle.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import DashboardScopeToggle from '@/components/dashboard/DashboardScopeToggle.vue'
import GroupQuotaCards from '@/components/dashboard/GroupQuotaCards.vue'
import MyStatsCards from '@/components/dashboard/MyStatsCards.vue'
import RealmTopology from '@/components/dashboard/RealmTopology.vue'
import NodeTable from '@/components/dashboard/NodeTable.vue'
import RecentDatasetsCard from '@/components/dashboard/RecentDatasetsCard.vue'
import RecentRunsCard from '@/components/dashboard/RecentRunsCard.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import IconButton from '@/components/ui/IconButton.vue'
import IconTile from '@/components/ui/IconTile.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import type { RealmView } from '@/composables/aruna/realm'
import type { RealmNodeInfo } from '@/lib/api'
import { givenName } from '@/components/nodes/node-display'
import { Activity, BookOpen, ChevronDown, CircleCheck, Copy, Download, FileJson2, Files, Gauge, HardDrive, Link, ListChecks, LoaderCircle, Network, Package, Plus, Server, TriangleAlert, Users, Workflow, X } from '@lucide/vue'
import { RouterLink, useRouter } from 'vue-router'
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useMyGroupsUsage } from '@/composables/useMyGroupsUsage'
import { useRecentRuns } from '@/composables/useRecentRuns'
import { usePublicNodes } from '@/composables/usePublicNodes'
import { useDatabases } from '@/composables/useDatabases'
import { computerName } from '@/composables/useRealmNodes'
import { useViewMode } from '@/composables/useViewMode'
import { useDashboardScope } from '@/composables/useDashboardScope'
import { useNotifications } from '@/composables/useNotifications'
import { useOnboarding } from '@/composables/useOnboarding'
import { startTour } from '@/composables/useTour'
import { docsTopicBySlug } from '@/docs/v1'
import { featureEnabled } from '@/lib/config'
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
const ThisComputer = defineAsyncComponent({
  loader: () => import('@/components/desktop/ThisComputer.vue'),
  onError: asyncChunkError,
})
const desktop = isDesktop()

const router = useRouter()
const { currentUser, myGroups, nodeInfo, realmInfo, usageInfo, loading, bootstrapped, sessionEpoch, refresh, refreshedEpoch, loadInfo, loadRealmView } = useAruna()
const { authPending } = useAuth()
const { dashboardRevision } = useNotifications()
const { scope, setScope } = useDashboardScope()
const { isNewUser, dismissOnboarding } = useOnboarding()
// The short tour of the dashboard, shared with its docs topic.
const portalTour = docsTopicBySlug('portal-tour')?.tour ?? []
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
    if (currentUser.value) void recentRuns.load()
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
// infrastructure: they are never listed or aggregated with the nodes.
// Signed out, the nodes come from their published addresses until the realm lists them.
const infraNodes = usePublicNodes(computed(() => (panelRealm.value?.nodes ?? []).filter((node) => node.kind !== 'user')))

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
const offlineNodes = computed(() => infraNodes.value.length - onlineNodes.value)

// Imports explain a busy node; each node's heartbeat counts them in the realm snapshot. A node
// without a heartbeat count adds nothing known, so the sum is then a lower bound.
// Heartbeats carry the counts only after a rollout: "none" needs every node to report 0, a
// node without a count leaves a dash.
const activity = computed(() => {
  const counts = infraNodes.value.map((node) => node.info?.utilization?.imports_running)
  return {
    running: counts.reduce<number>((sum, count) => sum + (count ?? 0), 0),
    reported: counts.length > 0 && counts.every((count) => count !== undefined),
    atLeast: counts.some((count) => count === undefined),
  }
})

// The visible runs, newest first: the Runs card counts the running ones.
const recentRuns = useRecentRuns()
// The Runs card's line: the running runs, else how many of the listed runs completed, but only
// when the list holds every run.
const runsLine = computed(() => {
  if (recentRuns.state.value !== 'ready') return null
  const { count, atLeast } = recentRuns.running.value
  if (count) return { running: count, atLeast, completed: 0, total: 0 }
  const runs = recentRuns.runs.value
  if (atLeast || !runs.length) return null
  return { running: 0, atLeast: false, completed: runs.filter((run) => run.task.state === 'COMPLETE').length, total: runs.length }
})
// This computer on the map, in the desktop: the realm nodes it is connected to now.
const mapComputer = computed(() => {
  const info = nodeInfo.value
  if (!desktop || !info?.connections) return null
  const peers = info.connections.filter((peer) => peer.status === 'connected').map((peer) => peer.peer_id)
  return { id: info.node.peer_id, name: deviceName.value, peers }
})
// How many realm nodes this computer reaches now, for its state card.
const computerLinks = computed(() => {
  const peers = new Set(mapComputer.value?.peers ?? [])
  if (!mapComputer.value || !infraNodes.value.length) return null
  return { count: infraNodes.value.filter((node) => peers.has(node.node_id)).length, total: infraNodes.value.length }
})
const openNode = (nodeId: string) => void router.push({ name: 'node', params: { nodeId } })
const groupView = useViewMode('dashboard-groups')
// The node under the pointer, lit up on the topology and in the table together.
const hoveredNode = ref<string | null>(null)

// Only metadata is copied automatically; the factor says nothing about data copies.
const metadataCopies = computed(() => {
  const factor = realmInfo.value?.metadata_replication.default_replication_factor
  if (factor === null) return 'Metadata on all eligible nodes'
  return factor === undefined ? null : `Metadata on ${factor} ${factor === 1 ? 'node' : 'nodes'}`
})

const publicOverview = computed(() => realmInfo.value?.public_overview)

// Realm-wide totals the same /system/usage response carries; the top-level
// counters next to them belong to this node and live on the Status page.
const realmTotals = computed(() => usageInfo.value?.realm ?? null)
const realmBuckets = useRealmBucketCount(realmTotals)
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)
// No database count here: the list holds only the databases the caller may read, not the realm's.
const realmBucketsLine = computed(() => {
  const totals = realmTotals.value
  if (!totals) return null
  const buckets = realmBuckets.value ?? { count: totals.buckets, exact: true }
  return { value: countText(buckets, formatCount), word: plural(buckets.exact ? buckets.count : 2, 'bucket', 'buckets') }
})
// The realm counts every record kind at once; only the groups count datasets apart from runs, so
// a signed-in Work cell counts them as the group card does. A guest sees the public record count.
const myUsage = useMyGroupsUsage()
const groupsUsage = myUsage.aggregate
// The group cards keep the group figures fresh; the realm scope has none, and its Runs card reads them too.
watch(myUsage.membershipKey, () => void myUsage.load(), { immediate: true })
watch(cardsRevision, () => {
  if (scope.value === 'realm') void myUsage.refresh()
})
// A visitor sees the realm-wide totals: data in one byte total, objects and datasets.
const guestRecords = computed(() => publicOverview.value?.live_datasets ?? null)
const guestBytes = computed(() => publicOverview.value?.data_bytes ?? null)
const guestObjects = computed(() => publicOverview.value?.objects ?? null)
// Without node records (a guest) the realm still names how many nodes it has configured.
const realmNodeCount = computed(() => infraNodes.value.length || (publicOverview.value?.nodes_configured ?? null))

// An upstream sign-in often brings no name, and the node then names the user by the user id.
const unnamed = computed(() => {
  const user = currentUser.value
  return Boolean(user && (!user.name.trim() || user.name === user.id))
})

// While a stored session restores, keep the copy neutral instead of flashing
// the guest greeting and its sign-in hint.
const pageTitle = computed(() => (currentUser.value || authPending.value ? 'Dashboard' : 'Aruna data portal'))
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
        <RefreshButton :busy="spinning" @click="onRefresh" />
      </template>
    </PageHeader>

    <div class="w-full px-4 sm:px-6 space-y-8 py-6">
      <div v-if="!painted" class="space-y-5" aria-busy="true">
        <span class="sr-only">Loading dashboard</span>
        <Skeleton class="h-44 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <template v-else>
      <SignInPanel v-if="!currentUser" compact />
      <Notice v-else-if="unnamed && !authPending">
        Your profile has no name{{ currentUser.email ? '' : ' or email' }}, so others see your user id.
        Add {{ currentUser.email ? 'it' : 'them' }} in your
        <RouterLink :to="{ name: 'settings', query: { tab: 'profile' } }" class="text-primary hover:underline">profile settings</RouterLink>.
      </Notice>

      <!-- First visit on the web: the docs and the short tour first, tutorials behind them. -->
      <section
        v-if="!desktop && currentUser && !authPending && isNewUser"
        class="surface relative flex flex-wrap items-center gap-4 border-primary/40 bg-primary/5 p-5 pr-12"
        aria-labelledby="welcome-heading"
      >
        <IconTile :icon="BookOpen" />
        <div class="min-w-0 flex-1">
          <h2 id="welcome-heading" class="font-display text-sm font-semibold text-aruna-navy">New here? Start with the basics.</h2>
          <p class="mt-1 text-xs text-muted-foreground">The docs explain the portal in a few short pages, and the tour points out the main controls.</p>
        </div>
        <div class="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <Button size="sm" class="max-sm:flex-1" as-child>
            <RouterLink :to="{ name: 'docs', params: { topic: 'portal-tour' } }">Open the docs</RouterLink>
          </Button>
          <Button variant="outline" size="sm" class="max-sm:flex-1" @click="startTour(portalTour)">Take the tour</Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="sm" class="max-sm:flex-1">Tutorials <ChevronDown class="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuItem v-if="featureEnabled('tes')" @click="router.push({ name: 'tutorial-compute' })">
                <Workflow class="h-3.5 w-3.5" /> Compute tutorial
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push({ name: 'tutorial-profile' })"><ListChecks class="h-3.5 w-3.5" /> Profile tutorial</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <IconButton label="Not now" class="absolute right-2 top-2" @click="dismissOnboarding"><X class="h-4 w-4" /></IconButton>
      </section>
      <HomeCards v-if="desktop && currentUser" />
      <ThisComputer
        v-if="desktop && currentUser"
        :name="deviceName"
        :node-id="renameId"
        :value="deviceRecord?.display_name ?? null"
        :connected="computerLinks"
      />

      <!-- Four stat cards: the stored scope decides whose figures, the Realm card is the same for both. -->
      <section aria-labelledby="overview-heading">
        <SectionHeading id="overview-heading" title="Overview" :icon="Gauge">
          <template v-if="currentUser" #actions>
            <DashboardScopeToggle :model-value="scope" @update:model-value="setScope" />
          </template>
        </SectionHeading>
        <div class="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <template v-if="currentUser && scope === 'personal'">
            <MyStatsCards v-if="myGroups.length" :refresh-revision="quotaRevision" />
            <div v-else class="surface col-span-2 grid place-items-center p-4"><EmptyState compact title="You do not belong to any groups yet." /></div>
          </template>
          <template v-else-if="!bootstrapped">
            <Skeleton v-for="n in 2" :key="n" class="h-[132px] rounded-xl" />
          </template>
          <template v-else-if="currentUser">
            <OverviewCell label="Storage" :icon="HardDrive" info="Stored data counts against quotas. Referenced data stays at its source.">
              <template #value>{{ realmTotals ? formatBytes(realmTotals.logical_bytes + realmTotals.referenced_bytes) : 'Unknown' }}</template>
              <template v-if="realmTotals" #unit>total</template>
              <template v-if="realmTotals">
                <span><Server /><b>{{ formatBytes(realmTotals.logical_bytes) }}</b> stored</span>
                <span><Link /><b>{{ formatBytes(realmTotals.referenced_bytes) }}</b> referenced</span>
              </template>
            </OverviewCell>
            <OverviewCell label="Objects" :icon="Files" tone="aqua" :to="{ name: 'buckets' }">
              <template #value>{{ realmTotals ? formatCount(realmTotals.objects) : 'Unknown' }}</template>
              <span v-if="realmBucketsLine"><Package /><b>{{ realmBucketsLine.value }}</b> {{ realmBucketsLine.word }}</span>
            </OverviewCell>
          </template>
          <template v-else>
            <OverviewCell label="Data" :icon="HardDrive">
              <template #value>{{ guestBytes !== null ? formatBytes(guestBytes) : 'Unknown' }}</template>
            </OverviewCell>
            <OverviewCell label="Objects" :icon="Files" tone="aqua" :to="{ name: 'buckets' }">
              <template #value>{{ guestObjects !== null ? formatCount(guestObjects) : 'Unknown' }}</template>
            </OverviewCell>
          </template>
          <!-- Totals wait for every group, so a partial sum never reads as the count. -->
          <template v-if="currentUser">
            <Skeleton v-if="groupsUsage.pending" class="h-[132px] rounded-xl" />
            <OverviewCell
              v-else
              label="Runs"
              :icon="Workflow"
              tone="ok"
              :to="{ name: 'compute' }"
              info="Runs of your groups. The realm counts no runs of its own."
            >
              <template #value>{{ groupsUsage.processRuns != null ? formatCount(groupsUsage.processRuns) : 'Unknown' }}</template>
              <span v-if="runsLine?.running"><LoaderCircle /><b>{{ runsLine.atLeast ? 'at least ' : '' }}{{ formatCount(runsLine.running) }}</b> running</span>
              <span v-else-if="runsLine">
                <CircleCheck v-if="runsLine.completed === runsLine.total" class="text-status-ok" />
                <b>{{ formatCount(runsLine.completed) }}/{{ formatCount(runsLine.total) }}</b> completed
              </span>
            </OverviewCell>
          </template>
          <OverviewCell v-else label="Datasets" :icon="FileJson2" tone="ok" :to="{ name: 'datasets' }">
            <template #value>{{ guestRecords !== null ? formatCount(guestRecords) : 'Unknown' }}</template>
          </OverviewCell>
          <OverviewCell label="Realm" :icon="Network" :tone="offlineNodes ? 'failed' : 'ok'" :to="currentUser ? { name: 'status' } : undefined">
            <template #value>{{ realmNodeCount !== null ? formatCount(realmNodeCount) : 'Unknown' }}</template>
            <template v-if="realmNodeCount !== null" #unit>{{ plural(realmNodeCount, 'node', 'nodes') }}</template>
            <!-- One state signal: the online count, a warning when nodes are offline; the realm scope
                 shows what the nodes import instead when every node reports it. -->
            <template v-if="infraNodes.length">
              <span v-if="offlineNodes" class="text-status-warn"><TriangleAlert /><b>{{ onlineNodes }}/{{ infraNodes.length }}</b> online</span>
              <span v-else-if="scope === 'realm' && currentUser && (activity.running || activity.reported)">
                <Download /><b>{{ activity.atLeast ? 'at least ' : '' }}{{ formatCount(activity.running) }}</b> importing
              </span>
              <span v-else><CircleCheck class="text-status-ok" /><b>{{ onlineNodes }}/{{ infraNodes.length }}</b> online</span>
            </template>
            <span v-if="metadataCopies"><Copy />{{ metadataCopies }}</span>
          </OverviewCell>
        </div>
      </section>

      <!-- The scope picks the band below the Overview: my groups, or the realm's nodes. -->
      <section v-if="currentUser && scope === 'personal'" aria-labelledby="dashboard-groups-heading">
        <SectionHeading id="dashboard-groups-heading" title="Groups" :icon="Users" info="A bucket stored on several nodes counts once.">
          <template v-if="myGroups.length" #actions>
            <ViewToggle v-model="groupView" />
          </template>
        </SectionHeading>
        <GroupQuotaCards v-if="myGroups.length" :refresh-revision="cardsRevision" :view="groupView" />
        <EmptyState v-else title="You are not a member of any group yet, create one to get started.">
          <template #icon><Users class="size-6" /></template>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'groups', query: { create: 'group' } }"><Plus class="h-3.5 w-3.5" /> Create a group</RouterLink>
          </Button>
        </EmptyState>
      </section>

      <!-- The topology on the left, the table on the right; both open a node's details. -->
      <section v-else-if="(currentUser ? scope === 'realm' : !authPending) && (infraNodes.length || deviceRecord)" aria-labelledby="realm-heading">
        <SectionHeading id="realm-heading" title="Realm" :icon="Network">
          <template v-if="currentUser" #actions>
            <Button variant="outline" size="sm" as-child><RouterLink :to="{ name: 'status' }"><Activity class="h-4 w-4" /> Status</RouterLink></Button>
          </template>
        </SectionHeading>
        <div class="grid overflow-hidden rounded-xl border border-border-subtle bg-card shadow-sm dark:shadow-none lg:grid-cols-[minmax(480px,34%)_minmax(0,1fr)]">
          <div class="relative h-[360px] overflow-hidden border-b border-border/60 bg-background lg:h-auto lg:min-h-[280px] lg:border-b-0 lg:border-r">
            <RealmTopology
              :nodes="infraNodes"
              :local-peer-id="(realmView?.info ?? nodeInfo)?.node.peer_id"
              :computer="mapComputer"
              :highlight="hoveredNode"
              @select="currentUser && openNode($event)"
              @hover="hoveredNode = $event"
            />
          </div>
          <NodeTable :linked="Boolean(currentUser)" :nodes="infraNodes" :computer="desktop ? deviceRecord : null" :highlight="hoveredNode" @hover="hoveredNode = $event" />
        </div>
      </section>

      <div class="grid gap-6" :class="currentUser && recentRuns.state.value !== 'off' ? 'lg:grid-cols-2' : ''">
        <RecentRunsCard v-if="currentUser && recentRuns.state.value !== 'off'" :runs="recentRuns.runs.value" :state="recentRuns.state.value" />
        <RecentDatasetsCard :refresh-revision="quotaRevision" />
      </div>
      </template>
    </div>

  </div>
</template>
