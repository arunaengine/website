<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import RecentRunsCard from '@/components/dashboard/RecentRunsCard.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Badge from '@/components/ui/Badge.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ConnectorsSection from '@/components/groups/ConnectorsSection.vue'
import RepositoriesSection from '@/components/groups/RepositoriesSection.vue'
import StorageSection from '@/components/groups/StorageSection.vue'
import GroupLocationSection from '@/components/groups/GroupLocationSection.vue'
import GroupAuditTrail from '@/components/groups/GroupAuditTrail.vue'
import PoliciesSection from '@/components/policies/PoliciesSection.vue'
import EffectivePolicies from '@/components/policies/EffectivePolicies.vue'
import GroupMembers from '@/components/groups/GroupMembers.vue'
import GroupStatsGrid from '@/components/groups/GroupStatsGrid.vue'
import GroupTokens from '@/components/groups/GroupTokens.vue'
import GroupDetailSkeleton from '@/components/groups/GroupDetailSkeleton.vue'
import GroupRoles from '@/components/groups/GroupRoles.vue'
import JoinRequestButton from '@/components/groups/JoinRequestButton.vue'
import JoinRequestsInbox from '@/components/groups/JoinRequestsInbox.vue'
import RenameGroupDialog from '@/components/groups/RenameGroupDialog.vue'
import DeleteGroupDialog from '@/components/groups/DeleteGroupDialog.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import UsageHistoryChart from '@/components/groups/UsageHistoryChart.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowRight, Boxes, Cable, ChartArea, ChevronRight, CircleCheck, Clock, Copy, Database, FileJson2, Files, FolderOpen, Gauge, Globe, HardDrive, Inbox, KeyRound, LayoutDashboard, Link, ListChecks, Lock, LogOut, Package, Pencil, ScrollText, Server, ShieldAlert, ShieldCheck, Trash2, Users, Workflow } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useJoinRequests } from '@/composables/useJoinRequests'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { hasGroupWrite } from '@/lib/groupAdmin'
import { assessQuota, quotaCountedBytes, referencedBytes, QUOTA_STATE_BADGES } from '@/lib/quota'
import { featureEnabled } from '@/lib/config'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage, formatBytes, formatNumber, relativeTime } from '@/lib/utils'
import { useRouteTab } from '@/composables/useRouteTab'
import { listBuckets } from '@/composables/useBucketCount'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRealmSnapshot } from '@/composables/useRealmSnapshot'
import { useRecentRuns } from '@/composables/useRecentRuns'
import { nodeName } from '@/components/nodes/node-display'
import { formatCount } from '@/lib/formatCount'
import { TES_GROUP_TAG } from '@/lib/tes'
import {
  ApiError,
  type GroupDetailResponse,
  type BucketSearchHit,
  type GroupBackendResponse,
  type GroupMember,
  type MetadataDocumentListItem,
  type UsageHistoryPoint,
  type UsageResponse,
  type GroupStatistics,
  getGroupStatistics,
} from '@/lib/api'
import { refreshContext, sessionEpoch } from '@/composables/aruna/state'

const props = defineProps<{ groupId: string; name?: string }>()
const emit = defineEmits<{ (e: 'left'): void; (e: 'deleted'): void }>()

const {
  getGroup,
  getGroupUsage,
  getGroupUsageHistory,
  listGroupMembers,
  listGroupMetadata,
  listGroupConnectors,
  listGroupBackends,
  leaveGroup,
  searchBuckets,
  toMetadataDoc,
  saving,
  currentUser,
  canAdminGroups,
} = useAruna()
const { writesDisabled } = useConnectivity()
const { joinRequestsEnabled } = useJoinRequests()
const route = useRoute()

// One-shot deep-link scroll to the storage section. Set per navigation (in the
// groupId watch) and consumed after the first successful reload, so @changed
// reloads from member/role edits don't yank the viewport.
let storageAnchorPending = false

const DOC_LIMIT = 8
const joinRequestCount = ref<number | null>(null)
const joinRequestError = ref<string | null>(null)
const renameOpen = ref(false)

const group = ref<GroupDetailResponse | null>(null)
const members = ref<GroupMember[]>([])
const membersHidden = ref(false)
const loadError = ref<string | null>(null)
const leaveError = ref<string | null>(null)
const leaving = ref(false)
const deleteOpen = ref(false)
const loadingDetail = ref(false)
const usage = ref<UsageResponse | null>(null)
const docs = ref<MetadataDocumentListItem[] | null>(null)
const docsError = ref<string | null>(null)
// Only the latest reload writes state: a group switch must not be overwritten
// by the requests of the group left behind.
let reloadSeq = 0
// Approximate count served by newer nodes (estimated per group); shown with a
// "~" so it never reads as exact. Without it a full page only proves "more
// exist", so the badge degrades to "8+".
const docsEstimate = ref<number | null>(null)
const moreDocs = computed(() => (docs.value?.length ?? 0) > DOC_LIMIT)
const docsCountLabel = computed(() => {
  if (docsEstimate.value !== null) return `~${formatNumber(docsEstimate.value)}`
  return moreDocs.value ? `${DOC_LIMIT}+` : String(docs.value?.length ?? 0)
})

const quotaStatus = computed(() => usage.value?.quota ?? null)
// The counter the backend QuotaGate enforces against (realm-wide logical bytes).
const usedBytes = computed(() => (usage.value ? quotaCountedBytes(usage.value) : 0))
const referenceBytes = computed(() => (usage.value ? referencedBytes(usage.value) : 0))
const quotaAssessment = computed(() => assessQuota(quotaStatus.value, usedBytes.value))
const quotaBadge = computed(() => QUOTA_STATE_BADGES[quotaAssessment.value.state])
// Group scope omits the physical counters (copies have no group dimension),
// so the physical clause renders only when the backend actually sent one.
const objectCounts = computed(() => {
  const value = usage.value
  if (!value || typeof value.objects !== 'number') return null
  const stored = typeof value.stored_blobs === 'number' ? value.stored_blobs : null
  // The realm-wide count, as for the bytes above; the node's own count misses other nodes.
  return { total: value.realm?.objects ?? value.objects, physicalBlobs: stored }
})
// The group's own counters from its usage, never the approximate document estimate.
const purposeCounts = computed(() => ({
  datasets: usage.value?.dataset_count,
  profiles: usage.value?.profile_count,
  runs: usage.value?.process_run_count,
}))
function purposeCountLabel(value: number | null | undefined): string {
  return value == null ? 'Unknown' : formatNumber(value)
}

// Usage history is gated off by default: the backend endpoint does not exist
// yet (aruna#250). With the flag off, loadHistory() short-circuits before any
// fetch and the whole section is hidden.
const usageHistoryEnabled = featureEnabled('usageHistory')
const historyRange = ref<'7d' | '30d' | '90d'>('30d')
const historyPoints = ref<UsageHistoryPoint[] | null>(null)
const historyLoading = ref(false)
const historyError = ref<string | null>(null)
const historyUnsupported = ref(false)
// Guards against out-of-order responses when the range switches or the group
// changes while a fetch is in flight: only the latest request writes state.
let historySeq = 0

async function loadHistory() {
  if (!usageHistoryEnabled) return
  const seq = ++historySeq
  historyLoading.value = true
  historyError.value = null
  historyUnsupported.value = false
  const days = { '7d': 7, '30d': 30, '90d': 90 }[historyRange.value]
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  try {
    const response = await getGroupUsageHistory(props.groupId, {
      from: from.toISOString(),
      to: to.toISOString(),
      resolution: days === 7 ? 'hour' : 'day',
    })
    if (seq !== historySeq) return
    historyPoints.value = response.points
  } catch (err) {
    if (seq !== historySeq) return
    historyPoints.value = null
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) historyUnsupported.value = true
    else historyError.value = errorMessage(err)
  } finally {
    if (seq === historySeq) historyLoading.value = false
  }
}

const isMember = computed(() =>
  Boolean(group.value?.roles.some((role) => role.assigned_users?.includes(currentUser.value?.id ?? ''))),
)
const canManage = computed(() =>
  Boolean(
    group.value?.roles.some(
      (role) => role.name === 'admin' && role.assigned_users?.includes(currentUser.value?.id ?? ''),
    ),
  ),
)
// Group admins and realm group administrators see counts and tokens, never more data.
const canSeeAccess = computed(() => canManage.value || canAdminGroups.value)
const groupStats = ref<GroupStatistics | null>(null)
const groupStatsError = ref<string | null>(null)
const tokensKey = ref(0)
let statsSeq = 0

async function loadStats() {
  const seq = ++statsSeq
  groupStats.value = null
  groupStatsError.value = null
  if (!canSeeAccess.value) return
  const { epoch, client } = refreshContext()
  try {
    const stats = await getGroupStatistics(props.groupId, client)
    if (seq === statsSeq && epoch === sessionEpoch.value) groupStats.value = stats
  } catch (err) {
    if (seq === statsSeq && epoch === sessionEpoch.value) groupStatsError.value = errorMessage(err)
  }
}

watch([() => props.groupId, canSeeAccess, sessionEpoch, tokensKey], () => void loadStats(), { immediate: true })

const connectorCount = ref<number | null>(null)
const backendCount = ref<number | null>(null)
const storageTick = ref(0)
const groupBackends = ref<GroupBackendResponse[]>([])

// Connector management: WRITE on /{realm}/g/{gid}/data/**.
const canWriteData = computed(() => {
  const detail = group.value
  if (!detail) return false
  return hasGroupWrite(detail, `/${detail.realm_id}/g/${detail.group_id}/data/**`, currentUser.value?.id ?? '')
})

// Repository connectors: WRITE on /{realm}/g/{gid}/meta/**.
const canWriteMeta = computed(() => {
  const detail = group.value
  if (!detail) return false
  return hasGroupWrite(detail, `/${detail.realm_id}/g/${detail.group_id}/meta/**`, currentUser.value?.id ?? '')
})

// Group admin (api ensure_group_admin), the gate storage, routing and request
// policies share, not the write rights objects need.
const canAdminGroup = computed(() => {
  const detail = group.value
  if (!detail) return false
  return hasGroupWrite(detail, `/${detail.realm_id}/g/${detail.group_id}/admin/**`, currentUser.value?.id ?? '')
})
const canAdminStorage = canAdminGroup

// Reading a group's policies already needs admin/config, so the tab tracks
// group admin rather than membership.
const policiesTabVisible = computed(() => featureEnabled('policies') && canAdminGroup.value)

const { shown } = usePortalFeatures()
// Hidden features lose their tab trigger and sections; a deep link still opens them.
const sourcesVisible = computed(() => isMember.value && (shown('connectors') || shown('repositories')))
const connectorLinked = computed(() => typeof route.query.connector === 'string')

// Route-driven tab state (?tab=…) so sections deep-link like ComputeView.
const TAB_NAMES = ['stats', 'members', 'roles', 'sources', 'storage', 'policies', 'audit']
const routeTab = useRouteTab(TAB_NAMES, 'stats')
// The bare ?connector=<id> deep link is one-shot: picking any tab releases it so
// the stats tab does not bounce back to sources.
const connectorLink = ref(true)
const tab = computed({
  get() {
    if (connectorLink.value && !route.query.tab && typeof route.query.connector === 'string' && isMember.value)
      return 'sources'
    const value = routeTab.value
    if (value === 'sources' && !isMember.value) return 'stats'
    if (value === 'storage' && !canAdminStorage.value) return 'stats'
    if (value === 'policies' && !policiesTabVisible.value) return 'stats'
    if (value === 'audit' && !canAdminGroup.value) return 'stats'
    return value
  },
  set(next: string) {
    connectorLink.value = false
    routeTab.value = next
  },
})

async function reload() {
  const seq = ++reloadSeq
  loadingDetail.value = true
  loadError.value = null
  usage.value = null
  docs.value = null
  docsError.value = null
  // The four sections load together and the detail renders once they settled,
  // so nothing pops in behind an already visible panel.
  const [detail, groupUsage, groupMembers, metadata] = await Promise.allSettled([
    getGroup(props.groupId),
    getGroupUsage(props.groupId),
    listGroupMembers(props.groupId),
    // One bounded page, never a walk; the panel only previews DOC_LIMIT rows
    // and links to Discover for the rest.
    listGroupMetadata(props.groupId, { limit: DOC_LIMIT + 1 }),
  ])
  if (seq !== reloadSeq) return
  if (detail.status === 'fulfilled') {
    group.value = detail.value
  } else {
    group.value = null
    loadError.value = errorMessage(detail.reason)
  }
  // Old backends have no per-group usage endpoint; a 404 just hides the block.
  usage.value = groupUsage.status === 'fulfilled' ? groupUsage.value : null
  if (groupMembers.status === 'fulfilled') {
    members.value = groupMembers.value.members
    membersHidden.value = false
  } else if (groupMembers.reason instanceof ApiError && groupMembers.reason.status === 403) {
    members.value = []
    membersHidden.value = true
  } else if (!loadError.value) {
    group.value = null
    loadError.value = errorMessage(groupMembers.reason)
  }
  // Datasets fail on their own: a failure here must not blank the panel.
  if (metadata.status === 'fulfilled') {
    docs.value = metadata.value.documents
    docsEstimate.value = metadata.value.total_estimate ?? null
  } else {
    docsError.value = errorMessage(metadata.reason)
  }
  loadingDetail.value = false
  void loadTabCounts()
  if (isMember.value) {
    void loadBuckets()
    void recentRuns.load()
  }
  // Independent usage-history endpoint, gated; no-op when off.
  void loadHistory()
  // The storage section renders only after getGroup + getGroupUsage resolve, so
  // the router's one-shot hash retry misses it (aruna#248 review F4). Scroll here
  // once per navigation; @changed reloads keep the flag consumed.
  if (storageAnchorPending && route.hash === '#storage-use' && usage.value) {
    storageAnchorPending = false
    await nextTick()
    document.getElementById('storage-use')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// The tab badges load with the group; the sections refresh them once opened.
// A failed count stays unknown, the section shows its own error.
function loadTabCounts() {
  const groupId = props.groupId
  if (isMember.value && connectorCount.value === null) {
    listGroupConnectors(groupId)
      .then((response) => {
        if (props.groupId === groupId) connectorCount.value = response.connectors.length
      })
      .catch(() => undefined)
  }
  if (canAdminStorage.value && backendCount.value === null) {
    listGroupBackends(groupId)
      .then((response) => {
        if (props.groupId !== groupId) return
        backendCount.value = response.backends.length
        groupBackends.value = response.backends
      })
      .catch(() => undefined)
  }
}

watch(
  () => props.groupId,
  () => {
    leaveError.value = null
    deleteOpen.value = false
    // The placeholder, not the previous group, covers the switch.
    group.value = null
    connectorCount.value = null
    backendCount.value = null
    groupBackends.value = []
    joinRequestCount.value = 0
    storageAnchorPending = true
    void reload()
  },
  { immediate: true },
)
watch(historyRange, () => void loadHistory())

// The group's buckets as the realm search lists them, one row per bucket with the nodes holding it.
const buckets = ref<BucketSearchHit[] | null>(null)
const bucketsComplete = ref(true)
const bucketsError = ref<string | null>(null)
let bucketRound = 0
async function loadBuckets() {
  const mine = ++bucketRound
  const groupId = props.groupId
  buckets.value = null
  bucketsError.value = null
  try {
    const listing = await listBuckets(searchBuckets, groupId, () => mine === bucketRound)
    if (mine !== bucketRound) return
    buckets.value = listing.hits
    bucketsComplete.value = listing.complete
  } catch (err) {
    if (mine === bucketRound) bucketsError.value = errorMessage(err)
  }
}
// Members of one distributed bucket share a row; an ordinary bucket is its own on each node.
const bucketRows = computed(() => {
  const rows = new Map<string, BucketSearchHit[]>()
  for (const hit of buckets.value ?? []) {
    const key = hit.set_id ? `set:${hit.set_id}` : `node:${hit.node_id}:${hit.bucket}`
    rows.set(key, [...(rows.get(key) ?? []), hit])
  }
  return [...rows].map(([key, hits]) => ({ key, bucket: hits[0]!.bucket, hits })).sort((a, b) => a.bucket.localeCompare(b.bucket))
})
const { realm } = useRealmSnapshot()
const { isLocalNode } = useRealmNodes()
function nodeLabel(nodeId: string): string {
  const record = realm.value?.nodes?.find((entry) => entry.node_id === nodeId)
  return record ? nodeName(record) : nodeId
}
const bucketLink = (hit: BucketSearchHit) => ({
  name: 'bucket',
  params: { bucketId: hit.bucket },
  query: { group: hit.group_id, ...(isLocalNode(hit.node_id) ? {} : { node: hit.node_id }) },
})
const datasetTitle = (doc: MetadataDocumentListItem) => toMetadataDoc(doc).title || doc.document_path

// The recent runs the caller can see that this group owns.
const recentRuns = useRecentRuns()
const groupRuns = computed(() => recentRuns.runs.value.filter((run) => run.task.tags?.[TES_GROUP_TAG] === props.groupId))
const completedRuns = computed(() => groupRuns.value.filter((run) => run.task.state === 'COMPLETE').length)

const askPrompt = computed(() => {
  const detail = group.value
  if (!detail) return 'Summarize this group: its datasets, members, and usage.'
  return `Summarize the group "${detail.display_name}" (${detail.group_id}): its datasets, members, and usage.`
})

async function leave() {
  if (leaving.value) return
  leaveError.value = null
  leaving.value = true
  try {
    await leaveGroup(props.groupId)
    emit('left')
  } catch (err) {
    leaveError.value = errorMessage(err)
  } finally {
    leaving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader :title="group?.display_name ?? name ?? groupId" :crumbs="[{ label: group?.display_name ?? name ?? groupId }]" :docs="{ topic: 'first-group', section: 'Groups own your work' }">
      <template #title>
        <span class="inline-flex flex-wrap items-center gap-2">
          {{ group?.display_name ?? name ?? groupId }}
          <Button
            v-if="group && canAdminGroup"
            variant="ghost"
            size="icon-sm"
            aria-label="Rename group"
            title="Rename group"
            @click="renameOpen = true"
          >
            <Pencil class="h-3.5 w-3.5" />
          </Button>
        </span>
      </template>
      <template v-if="group" #description>
        <span class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span v-if="canManage" class="inline-flex items-center gap-1.5"><ShieldCheck class="size-4" />Admin</span>
          <span v-else-if="isMember" class="inline-flex items-center gap-1.5"><Users class="size-4" />Member</span>
          <span v-if="!membersHidden" class="inline-flex items-center gap-1.5"><Users class="size-4" /><b class="font-medium text-foreground">{{ formatCount(members.length) }}</b> {{ members.length === 1 ? 'member' : 'members' }}</span>
          <span class="inline-flex items-center gap-1.5 font-mono text-xs" :title="group.group_id">{{ group.group_id }}<CopyButton :value="group.group_id" label="Copy group id" /></span>
        </span>
      </template>
      <template #actions>
        <template v-if="group">
          <AskAiButton :prompt="askPrompt" :subject="`group ${groupId}`" />
          <Button
            v-if="tab === 'stats' && canManage && joinRequestsEnabled && !joinRequestError && joinRequestCount !== null && joinRequestCount > 0"
            variant="outline"
            size="sm"
            class="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25 dark:hover:text-amber-100"
            aria-label="You have unanswered join requests"
            @click="tab = 'members'"
          >
            <Inbox class="h-3.5 w-3.5 shrink-0" />
            You have unanswered join requests
          </Button>
          <Button v-if="isMember" variant="outline" size="sm" :disabled="saving || leaving" :aria-busy="leaving" @click="leave">
            <Spinner v-if="leaving" label="Leaving the group" class="text-current" /><LogOut v-else class="h-3.5 w-3.5" /> Leave group
          </Button>
          <Button
            v-if="canAdminGroup"
            variant="outline"
            size="sm"
            :disabled="saving || writesDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
            @click="deleteOpen = true"
          >
            <Trash2 class="h-3.5 w-3.5" /> Delete group
          </Button>
          <JoinRequestButton :group-id="group.group_id" :group-name="group.display_name" />
        </template>
      </template>
    </PageHeader>

    <div class="w-full space-y-8 px-4 py-6 sm:px-6">
    <GroupDetailSkeleton v-if="loadingDetail && !group" />
    <EmptyState v-else-if="loadError" :title="loadError" />
    <template v-else-if="group">
      <Notice v-if="leaveError" tone="error">{{ leaveError }}</Notice>
      <RenameGroupDialog
        v-model:open="renameOpen"
        :group-id="group.group_id"
        :name="group.display_name"
        @renamed="reload"
      />
      <DeleteGroupDialog v-model:open="deleteOpen" :group-id="group.group_id" @deleted="emit('deleted')" />

      <div v-if="usage" class="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <OverviewCell id="storage-use" class="scroll-mt-24" label="Storage" :icon="HardDrive" info="Stored data counts against the quota; referenced data stays at its source.">
          <template #value>{{ formatBytes(usedBytes) }}</template>
          <template #unit>{{ quotaStatus?.quota_bytes != null ? `of ${formatBytes(quotaStatus.quota_bytes)}` : 'stored' }}</template>
          <span v-if="referenceBytes"><Link /><b>{{ formatBytes(referenceBytes) }}</b> referenced</span>
          <span v-if="quotaStatus && quotaStatus.quota_bytes == null">No quota</span>
          <span v-else-if="!quotaStatus">Quota unknown</span>
          <span v-if="quotaStatus?.ceiling_bytes != null"><ShieldAlert /><b>{{ formatBytes(quotaStatus.ceiling_bytes) }}</b> hard cap</span>
          <template v-if="quotaStatus?.quota_bytes != null" #action>
            <QuotaBar
              class="w-full"
              :used="usedBytes"
              :quota="quotaStatus.quota_bytes"
              :ceiling="quotaStatus.ceiling_bytes"
              :referenced="referenceBytes"
              :warn="quotaStatus.warning"
              :show-labels="false"
              label="Group storage"
            />
          </template>
        </OverviewCell>
        <OverviewCell label="Objects" :icon="Files" tone="sky" :to="isMember ? { name: 'buckets', query: { group: group.group_id } } : undefined">
          <template #value>{{ objectCounts ? formatCount(objectCounts.total) : 'Unknown' }}</template>
          <span v-if="buckets !== null"><Package /><b>{{ bucketsComplete ? '' : 'at least ' }}{{ formatCount(bucketRows.length) }}</b> {{ bucketRows.length === 1 ? 'bucket' : 'buckets' }}</span>
          <span v-if="objectCounts?.physicalBlobs != null"><Copy /><b>{{ formatCount(objectCounts.physicalBlobs) }}</b> {{ objectCounts.physicalBlobs === 1 ? 'physical blob location' : 'physical blob locations' }}</span>
        </OverviewCell>
        <OverviewCell label="Datasets" :icon="FileJson2" tone="aqua" :to="{ name: 'datasets', query: { group: group.group_id } }">
          <template #value>{{ purposeCountLabel(purposeCounts.datasets) }}</template>
          <span v-if="purposeCounts.profiles != null"><ListChecks /><b>{{ formatCount(purposeCounts.profiles) }}</b> {{ purposeCounts.profiles === 1 ? 'profile' : 'profiles' }}</span>
        </OverviewCell>
        <OverviewCell label="Runs" :icon="Workflow" tone="ok">
          <template #value>{{ purposeCountLabel(purposeCounts.runs) }}</template>
          <span v-if="groupRuns.length && recentRuns.state.value === 'ready'"><CircleCheck class="text-status-ok" /><b>{{ completedRuns }}/{{ groupRuns.length }}</b> recent completed</span>
        </OverviewCell>
      </div>
      <Notice v-if="quotaAssessment.state === 'over-quota'" tone="warning">
        Over the quota. Writes are accepted until the hard cap; above it the node rejects uploads.
      </Notice>
      <Notice v-else-if="quotaAssessment.state === 'over-ceiling'" tone="error">
        The node rejects uploads for this group. Free storage or ask a realm admin to raise the quota.
      </Notice>

      <Tabs v-model="tab">
        <div data-tour="group-tabs" class="mb-6">
          <TabsList class="h-auto flex-wrap">
            <TabsTrigger value="stats" class="gap-1.5"><LayoutDashboard class="h-3.5 w-3.5" /> Overview</TabsTrigger>
            <TabsTrigger value="members" class="gap-1.5">
              <Users class="h-3.5 w-3.5" /> Members
              <Badge v-if="!membersHidden" variant="outline" size="count">{{ members.length }}</Badge>
            </TabsTrigger>
            <TabsTrigger value="roles" class="gap-1.5">
              <ShieldCheck class="h-3.5 w-3.5" /> Roles
              <Badge variant="outline" size="count">{{ group.roles.length }}</Badge>
            </TabsTrigger>
            <TabsTrigger v-if="sourcesVisible" value="sources" class="gap-1.5">
              <Cable class="h-3.5 w-3.5" /> Data sources
              <!-- The pill holds the badge's place, so a late count never moves the tabs. -->
              <template v-if="shown('connectors')">
                <Badge v-if="connectorCount !== null" variant="outline" size="count">{{ connectorCount }}</Badge>
                <Skeleton v-else class="size-5 rounded-full" />
              </template>
            </TabsTrigger>
            <TabsTrigger v-if="policiesTabVisible" value="policies" class="gap-1.5">
              <ShieldAlert class="h-3.5 w-3.5" /> Policies
            </TabsTrigger>
            <TabsTrigger v-if="canAdminStorage" value="storage" class="gap-1.5">
              <Database class="h-3.5 w-3.5" /> Storage
              <Badge v-if="backendCount !== null" variant="outline" size="count">{{ backendCount }}</Badge>
              <Skeleton v-else class="size-5 rounded-full" />
            </TabsTrigger>
            <TabsTrigger v-if="canAdminGroup" value="audit" class="gap-1.5">
              <ScrollText class="h-3.5 w-3.5" /> Audit trail
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stats" class="mt-0 space-y-8">
          <section v-if="canSeeAccess" aria-labelledby="group-statistics-heading">
            <SectionHeading id="group-statistics-heading" title="Statistics" :icon="Gauge" info="Counts and sizes for this group. Jobs and tokens count what this node holds." />
            <div class="surface p-5">
              <ErrorPanel v-if="groupStatsError" :message="groupStatsError" @retry="loadStats" />
              <Skeleton v-else-if="!groupStats" class="h-24" />
              <GroupStatsGrid v-else :stats="groupStats" />
            </div>
          </section>
          <div class="grid gap-6 lg:grid-cols-2">
            <section v-if="isMember" class="flex flex-col" aria-labelledby="group-buckets-heading">
              <SectionHeading id="group-buckets-heading" title="Buckets" :icon="Boxes">
                <template #actions>
                  <Button variant="outline" size="sm" as-child>
                    <RouterLink :to="{ name: 'buckets', query: { group: group.group_id } }"><FolderOpen class="h-3.5 w-3.5" /> Open in Data</RouterLink>
                  </Button>
                </template>
              </SectionHeading>
              <div class="surface relative min-h-48 flex-1 overflow-hidden">
                <div class="overflow-y-auto lg:absolute lg:inset-0">
                  <p v-if="bucketsError" class="px-5 py-4 text-xs text-destructive">{{ bucketsError }}</p>
                  <p v-else-if="buckets === null" class="px-5 py-4 text-xs text-muted-foreground">Reading the group's buckets…</p>
                  <p v-else-if="!bucketRows.length" class="px-5 py-4 text-xs text-muted-foreground">{{ bucketsComplete ? 'No buckets yet.' : 'Not every node answered, so buckets may be missing.' }}</p>
                  <ul v-else class="divide-y divide-border-subtle">
                    <li v-for="row in bucketRows" :key="row.key" class="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <IconTile :icon="Package" tone="muted" size="sm" />
                      <span class="min-w-0 flex-1">
                        <RouterLink :to="bucketLink(row.hits[0]!)" class="block truncate text-sm font-medium text-foreground hover:underline">{{ row.bucket }}</RouterLink>
                        <span class="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                          <Server class="size-3.5 shrink-0" aria-hidden="true" />
                          <template v-for="(hit, index) in row.hits" :key="hit.node_id">
                            <RouterLink :to="{ name: 'node', params: { nodeId: hit.node_id } }" class="hover:text-foreground hover:underline">{{ nodeLabel(hit.node_id) }}</RouterLink><span v-if="index < row.hits.length - 1">,</span>
                          </template>
                        </span>
                      </span>
                      <RouterLink :to="bucketLink(row.hits[0]!)" :aria-label="`Open ${row.bucket}`"><ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" /></RouterLink>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section class="flex flex-col" aria-labelledby="group-datasets-heading">
              <SectionHeading id="group-datasets-heading" title="Datasets" :icon="FileJson2" :count="docs ? docsCountLabel : undefined">
                <template #actions>
                  <Button variant="outline" size="sm" as-child>
                    <RouterLink :to="{ name: 'datasets', query: { group: group.group_id } }"><ArrowRight class="h-3.5 w-3.5" /> All datasets</RouterLink>
                  </Button>
                </template>
              </SectionHeading>
              <div class="surface relative min-h-48 flex-1 overflow-hidden">
                <div class="overflow-y-auto lg:absolute lg:inset-0">
                  <p v-if="docsError" class="px-5 py-4 text-xs text-destructive">{{ docsError }}</p>
                  <p v-else-if="docs && !docs.length" class="px-5 py-4 text-xs text-muted-foreground">No datasets yet.</p>
                  <ul v-else-if="docs" class="divide-y divide-border-subtle">
                    <li v-for="doc in docs.slice(0, DOC_LIMIT)" :key="doc.document_id">
                      <RouterLink :to="{ name: 'dataset', params: { id: doc.document_id } }" class="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <IconTile :icon="FileJson2" tone="muted" size="sm" />
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-sm font-medium text-foreground">{{ datasetTitle(doc) }}</span>
                          <span class="flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
                            <span class="inline-flex items-center gap-1.5"><component :is="doc.public ? Globe : Lock" class="size-3.5" />{{ doc.public ? 'Public' : 'Private' }}</span>
                            <span class="inline-flex items-center gap-1.5"><Clock class="size-3.5" />Updated {{ relativeTime(doc.updated_at) }}</span>
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

          <RecentRunsCard v-if="isMember && recentRuns.state.value !== 'off'" :runs="groupRuns" :state="recentRuns.state.value" />

          <section v-if="usageHistoryEnabled" aria-labelledby="usage-history-heading">
            <SectionHeading id="usage-history-heading" title="Usage history" :icon="ChartArea">
              <template #actions>
                <div class="flex gap-1">
                  <Button
                    v-for="range in (['7d', '30d', '90d'] as const)"
                    :key="range"
                    size="sm"
                    :variant="historyRange === range ? 'default' : 'outline'"
                    @click="historyRange = range"
                  >
                    {{ range }}
                  </Button>
                </div>
              </template>
            </SectionHeading>
            <div class="surface p-5">
              <Skeleton v-if="historyLoading && !historyPoints" class="h-36" />
              <p v-else-if="historyUnsupported" class="text-xs text-muted-foreground">This node does not serve usage history yet.</p>
              <ErrorPanel v-else-if="historyError" :message="historyError" @retry="loadHistory" />
              <p v-else-if="!historyPoints || historyPoints.length < 2" class="text-xs text-muted-foreground">No usage history yet.</p>
              <template v-else>
                <div :class="historyLoading ? 'opacity-60 transition-opacity' : ''">
                  <UsageHistoryChart
                    :points="historyPoints"
                    :quota-bytes="quotaStatus?.quota_bytes"
                    :ceiling-bytes="quotaStatus?.ceiling_bytes"
                  />
                </div>
                <p class="mt-2 text-xs text-muted-foreground">Logical bytes, the counter quotas are enforced against.</p>
              </template>
            </div>
          </section>

          <GroupLocationSection v-if="isMember && !canAdminStorage" :group="group" :can-admin="false" class="surface" />
        </TabsContent>

        <TabsContent value="members" :force-mount="canManage && joinRequestsEnabled" :class="tab === 'members' ? 'mt-0 space-y-8' : 'mt-0 hidden'">
          <section v-if="canManage && joinRequestsEnabled" aria-label="Join requests">
            <SectionHeading title="Join requests" :icon="Inbox">
              <template #actions>
                <Badge v-if="joinRequestCount !== null" :variant="joinRequestCount > 0 ? 'warn' : 'outline'" size="count" aria-label="Pending access requests">{{ joinRequestCount }}</Badge>
              </template>
            </SectionHeading>
            <div class="surface overflow-hidden">
              <JoinRequestsInbox
                :group-id="group.group_id"
                :roles="group.roles"
                @changed="reload"
                @count="joinRequestCount = $event"
                @load-error="joinRequestError = $event"
              />
            </div>
          </section>
          <section aria-labelledby="group-members-heading">
            <SectionHeading id="group-members-heading" title="Members" :icon="Users" />
            <EmptyState v-if="membersHidden" title="Only group members see the member list." />
            <div v-else class="surface overflow-x-auto">
              <GroupMembers
                :group-id="group.group_id"
                :members="members"
                :roles="group.roles"
                :can-manage="canManage"
                @changed="reload"
                @revoked="tokensKey++"
              />
            </div>
          </section>
          <section v-if="canSeeAccess" aria-labelledby="group-tokens-heading">
            <SectionHeading id="group-tokens-heading" title="Tokens" :icon="KeyRound" info="Service account tokens and S3 keys bound to this group, as this node holds them." />
            <div class="surface overflow-x-auto">
              <GroupTokens :group-id="group.group_id" :reload-key="tokensKey" />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="roles" class="mt-0">
          <SectionHeading title="Roles" :icon="ShieldCheck" info="Each role is a set of access rules on part of this group. Assign roles to members in the Members tab." />
          <div class="surface overflow-hidden">
            <GroupRoles :group="group" :can-manage="canManage" @changed="reload" />
          </div>
        </TabsContent>

        <TabsContent v-if="isMember" value="sources" class="mt-0">
          <div class="surface overflow-hidden">
            <ConnectorsSection
              v-if="shown('connectors') || !sourcesVisible || connectorLinked"
              :group-id="group.group_id"
              :can-write="canWriteData"
              @count="connectorCount = $event"
            />
            <RepositoriesSection
              v-if="shown('repositories') || !sourcesVisible"
              :group-id="group.group_id"
              :can-write="canWriteMeta"
            />
          </div>
        </TabsContent>

        <TabsContent v-if="policiesTabVisible" value="policies" class="mt-0">
          <div class="surface space-y-8 p-5">
            <PoliciesSection scope="group" :group-id="group.group_id" :can-admin="canAdminGroup" />
            <EffectivePolicies :group-id="group.group_id" />
          </div>
        </TabsContent>

        <TabsContent v-if="canAdminStorage" value="storage" class="mt-0">
          <div class="surface overflow-hidden">
            <StorageSection
              :group-id="group.group_id"
              :group-name="group.display_name"
              :dataset-bucket="group.dataset_location?.bucket ?? null"
              :can-admin="canAdminStorage"
              :focus-link="typeof route.query.link === 'string' ? route.query.link : null"
              @count="backendCount = $event"
              @backends="(groupBackends = $event), storageTick++"
            />
            <GroupLocationSection :group="group" can-admin :reload="storageTick" class="border-t border-border" @changed="group = $event" />
          </div>
        </TabsContent>

        <TabsContent v-if="canAdminGroup" value="audit" class="mt-0">
          <GroupAuditTrail v-if="tab === 'audit'" :group-id="group.group_id" />
        </TabsContent>
      </Tabs>
    </template>
    </div>
  </div>
</template>
