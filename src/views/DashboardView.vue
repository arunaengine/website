<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import DashboardScopeToggle from '@/components/dashboard/DashboardScopeToggle.vue'
import GroupQuotaCards from '@/components/dashboard/GroupQuotaCards.vue'
import MyStatsCards from '@/components/dashboard/MyStatsCards.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { RealmView } from '@/composables/aruna/realm'
import { ArrowRight, BookOpen, Plus } from '@lucide/vue'
import { RouterLink, useRouter } from 'vue-router'
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useDatabases } from '@/composables/useDatabases'
import { useDashboardScope } from '@/composables/useDashboardScope'
import { useOnboarding } from '@/composables/useOnboarding'
import { startTour } from '@/composables/useTour'
import { useNotifications } from '@/composables/useNotifications'
import { useRefresh } from '@/composables/useRefresh'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { docsTopicBySlug } from '@/docs/v1'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { featureEnabled } from '@/lib/config'
import { isDesktop } from '@/lib/desktop'
import { POLL_SLOW_MS, follow, onWake } from '@/lib/poll'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'
import { countText, useRealmBucketCount } from '@/composables/useBucketCount'

// The desktop adds its own cards; the web build never loads them.
const HomeCards = defineAsyncComponent({
  loader: () => import('@/components/desktop/HomeCards.vue'),
  onError: asyncChunkError,
})
const desktop = isDesktop()

const router = useRouter()
const { currentUser, myGroups, nodeInfo, realmInfo, usageInfo, loading, bootstrapped, sessionEpoch, refresh, refreshedEpoch, loadInfo, loadRealmView } = useAruna()
const { authPending } = useAuth()
const { dashboardRevision } = useNotifications()
const { scope, setScope } = useDashboardScope()
const { isNewUser, dismissOnboarding } = useOnboarding()
// Nothing to practise on when this deployment serves no compute.
const computeTutorialOffered = computed(() => featureEnabled('tes'))
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

async function refreshDashboard() {
  if (refreshing.value) {
    refreshQueued = true
    return
  }
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

// This computer by its own /system/info, the device node: the realm nodes it is connected to now.
const computer = computed(() => {
  const info = nodeInfo.value
  if (!desktop || !info?.connections) return null
  const id = info.node.peer_id
  const labels = deviceNodes.value.find((node) => node.node_id === id)?.info?.labels ?? {}
  const name = labels['name'] || labels['display_name'] || labels['device'] || 'This computer'
  const peers = info.connections.filter((peer) => peer.status === 'connected').map((peer) => peer.peer_id)
  return { id, name, peers }
})

const onlineNodes = computed(() => infraNodes.value.filter((node) => node.present).length)
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
const databases = useDatabases()
databases.ensure()
const realmDataLine = computed(() => {
  const totals = realmTotals.value
  if (!totals) return ''
  const buckets = realmBuckets.value ?? { count: totals.buckets, exact: true }
  const parts = [`${countText(buckets, formatCount)} ${plural(buckets.exact ? buckets.count : 2, 'bucket', 'buckets')}`]
  if (databases.state.value === 'ready') {
    const count = databases.rows.value.length
    parts.push(`${databases.complete.value ? '' : 'at least '}${formatCount(count)} ${plural(count, 'database', 'databases')}`)
  }
  return parts.join(', ')
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
      : 'Live data from the local Aruna API.'
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

      <!-- First visit: the docs and the short tour first, tutorials behind them. -->
      <section
        v-if="currentUser && !authPending && isNewUser"
        class="surface flex flex-wrap items-center gap-4 border-primary/40 bg-primary/5 p-5"
        aria-labelledby="welcome-tutorials-heading"
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <BookOpen class="h-5 w-5" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 id="welcome-tutorials-heading" class="font-display text-sm font-semibold text-aruna-navy">
            New here? Start with the basics.
          </h2>
          <p class="mt-1 text-xs text-muted-foreground">
            The docs explain the portal in a few short pages, and the tour points out the main controls.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button as-child>
            <RouterLink :to="{ name: 'docs', params: { topic: 'portal-tour' } }">Open the docs</RouterLink>
          </Button>
          <Button variant="outline" @click="startTour(portalTour)">Take the tour</Button>
          <Button v-if="computeTutorialOffered" variant="ghost" size="sm" as-child>
            <RouterLink :to="{ name: 'tutorial-compute' }">Compute tutorial</RouterLink>
          </Button>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink :to="{ name: 'tutorial-profile' }">Profile tutorial</RouterLink>
          </Button>
          <Button variant="ghost" size="sm" @click="dismissOnboarding">Not now</Button>
        </div>
      </section>

      <HomeCards v-if="desktop && currentUser" />

      <!-- One card for the figures: the stored scope decides whose, the realm cell is the same for both. -->
      <section class="surface overflow-hidden" aria-labelledby="overview-heading">
        <header class="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h2 id="overview-heading" class="font-display text-[15px] font-semibold text-foreground">Overview</h2>
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
            <template v-if="replication">{{ replication }} </template>
            <RouterLink :to="{ name: 'status' }" class="text-primary hover:underline">Status</RouterLink>
          </OverviewCell>
        </div>
      </section>

      <GroupQuotaCards v-if="currentUser && myGroups.length" :refresh-revision="cardsRevision" />
      </template>
    </div>

  </div>
</template>
