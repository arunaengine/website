<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConnectorsSection from '@/components/groups/ConnectorsSection.vue'
import StorageBackendsSection from '@/components/groups/StorageBackendsSection.vue'
import GroupRoutingSection from '@/components/groups/GroupRoutingSection.vue'
import PoliciesSection from '@/components/policies/PoliciesSection.vue'
import EffectivePolicies from '@/components/policies/EffectivePolicies.vue'
import GroupMembers from '@/components/groups/GroupMembers.vue'
import GroupRoles from '@/components/groups/GroupRoles.vue'
import JoinRequestButton from '@/components/groups/JoinRequestButton.vue'
import JoinRequestsInbox from '@/components/groups/JoinRequestsInbox.vue'
import UsageHistoryChart from '@/components/groups/UsageHistoryChart.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Cable, ChartArea, Database, FileJson2, HardDrive, Inbox, LogOut, Route, ShieldAlert, ShieldCheck, Users } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useJoinRequests } from '@/composables/useJoinRequests'
import { assessQuota, quotaCountedBytes, referencedBytes, QUOTA_STATE_BADGES } from '@/lib/quota'
import { featureEnabled } from '@/lib/config'
import { errorMessage, formatBytes, formatNumber, relativeTime } from '@/lib/utils'
import { useRouteTab } from '@/composables/useRouteTab'
import {
  ApiError,
  type GroupDetailResponse,
  type GroupBackendResponse,
  type GroupMember,
  type MetadataDocumentListItem,
  type UsageHistoryPoint,
  type UsageResponse,
} from '@/lib/api'

const props = defineProps<{ groupId: string }>()
const emit = defineEmits<{ (e: 'left'): void }>()

const { getGroup, getGroupUsage, getGroupUsageHistory, listGroupMembers, listGroupMetadata, leaveGroup, saving, currentUser } = useAruna()
const { joinRequestsEnabled } = useJoinRequests()
const route = useRoute()

// One-shot deep-link scroll to the storage section. Set per navigation (in the
// groupId watch) and consumed after the first successful reload, so @changed
// reloads from member/role edits don't yank the viewport.
let storageAnchorPending = false

const DOC_LIMIT = 8
const joinRequestCount = ref(0)

const group = ref<GroupDetailResponse | null>(null)
const members = ref<GroupMember[]>([])
const membersHidden = ref(false)
const loadError = ref<string | null>(null)
const leaveError = ref<string | null>(null)
const loadingDetail = ref(false)
const usage = ref<UsageResponse | null>(null)
const docs = ref<MetadataDocumentListItem[] | null>(null)
const docsError = ref<string | null>(null)
const docsLoading = ref(false)
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
// objects/stored_blobs exist at group scope on quota-aware backends; the type
// declares them non-optional, but older responses may omit them, so guard at
// runtime and hide the line instead of rendering NaN.
const objectCounts = computed(() => {
  const value = usage.value
  if (!value || typeof value.objects !== 'number' || typeof value.stored_blobs !== 'number') return null
  return { total: value.objects, physicalBlobs: value.stored_blobs }
})
const purposeCounts = computed(() => [
  { label: 'Datasets', value: usage.value?.dataset_count },
  { label: 'Profiles', value: usage.value?.profile_count },
  { label: 'Process runs', value: usage.value?.process_run_count },
])
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
const connectorCount = ref<number | null>(null)
const backendCount = ref<number | null>(null)
const groupBackends = ref<GroupBackendResponse[]>([])

// Mirrors the backend permission gates. Public roles apply to every principal,
// so they count too.
function hasWrite(detail: GroupDetailResponse, target: string, userId: string): boolean {
  return detail.roles.some((role) => {
    if (!(role.public || role.assigned_users?.includes(userId))) return false
    return Object.entries(role.permissions).some(([key, value]) => {
      if (value.toLowerCase() !== 'write') return false
      if (key === target) return true
      if (!key.endsWith('/**')) return false
      const base = key.slice(0, -3)
      return target === base || target.startsWith(`${base}/`)
    })
  })
}

// Connector management: WRITE on /{realm}/g/{gid}/data/**.
const canWriteData = computed(() => {
  const detail = group.value
  if (!detail) return false
  return hasWrite(detail, `/${detail.realm_id}/g/${detail.group_id}/data/**`, currentUser.value?.id ?? '')
})

// Group admin (api ensure_group_admin), the gate storage, routing and request
// policies share, not the write rights objects need.
const canAdminGroup = computed(() => {
  const detail = group.value
  if (!detail) return false
  return hasWrite(detail, `/${detail.realm_id}/g/${detail.group_id}/admin/**`, currentUser.value?.id ?? '')
})
const canAdminStorage = canAdminGroup

// Reading a group's policies already needs admin/config, so the tab tracks
// group admin rather than membership.
const policiesTabVisible = computed(() => featureEnabled('policies') && canAdminGroup.value)

// Route-driven tab state (?tab=…) so sections deep-link like ComputeView.
const TAB_NAMES = ['stats', 'members', 'roles', 'sources', 'storage', 'policies']
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
    return value
  },
  set(next: string) {
    connectorLink.value = false
    routeTab.value = next
  },
})

async function reload() {
  loadingDetail.value = true
  loadError.value = null
  usage.value = null
  docs.value = null
  docsError.value = null
  try {
    group.value = await getGroup(props.groupId)
    // Old backends have no per-group usage endpoint; a 404 just hides the block.
    usage.value = await getGroupUsage(props.groupId).catch(() => null)
    try {
      members.value = (await listGroupMembers(props.groupId)).members
      membersHidden.value = false
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        members.value = []
        membersHidden.value = true
      } else {
        throw err
      }
    }
    // Documents are loaded separately: a failure here must not blank the panel.
    // One bounded page, never a walk; the panel only previews DOC_LIMIT rows
    // and links to Discover for the rest.
    docsLoading.value = true
    try {
      const page = await listGroupMetadata(props.groupId, { limit: DOC_LIMIT + 1 })
      docs.value = page.documents
      docsEstimate.value = page.total_estimate ?? null
    } catch (err) {
      docsError.value = errorMessage(err)
    } finally {
      docsLoading.value = false
    }
  } catch (err) {
    loadError.value = errorMessage(err)
    group.value = null
  } finally {
    loadingDetail.value = false
  }
  // Independent usage-history endpoint, gated; no-op when off.
  void loadHistory()
  // The storage section renders only after getGroup + getGroupUsage resolve, so
  // the router's one-shot hash retry misses it (aruna#248 review F4). Scroll here
  // once per navigation; @changed reloads keep the flag consumed.
  if (storageAnchorPending && route.hash === '#storage' && usage.value) {
    storageAnchorPending = false
    await nextTick()
    document.getElementById('storage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

watch(
  () => props.groupId,
  () => {
    leaveError.value = null
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

async function leave() {
  leaveError.value = null
  try {
    await leaveGroup(props.groupId)
    emit('left')
  } catch (err) {
    leaveError.value = errorMessage(err)
  }
}
</script>

<template>
  <div class="rounded-lg border border-border bg-background/60">
    <div v-if="loadingDetail && !group" class="px-5 py-6 text-center text-xs text-muted-foreground">Loading group…</div>
    <div v-else-if="loadError" class="px-5 py-6 text-center text-xs text-destructive">{{ loadError }}</div>
    <template v-else-if="group">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="truncate text-sm font-semibold text-foreground">{{ group.display_name }}</h4>
            <Badge v-if="canManage" size="sm" variant="royal" class="uppercase"><ShieldCheck class="mr-0.5 h-3 w-3" /> admin</Badge>
            <Badge v-else-if="isMember" size="sm" variant="secondary" class="uppercase">member</Badge>
          </div>
          <div class="truncate font-mono text-[10px] text-muted-foreground">{{ group.group_id }}</div>
        </div>
        <Button v-if="isMember" variant="outline" size="sm" :disabled="saving" @click="leave">
          <LogOut class="h-3.5 w-3.5" /> Leave group
        </Button>
        <JoinRequestButton v-if="group" :group-id="group.group_id" :group-name="group.display_name" />
      </header>
      <div v-if="leaveError" class="border-b border-border px-5 py-2 text-xs text-destructive">{{ leaveError }}</div>

      <Tabs v-model="tab">
        <div class="border-b border-border px-5 py-2">
          <TabsList class="h-auto flex-wrap">
            <TabsTrigger value="stats" class="gap-1.5"><ChartArea class="h-3.5 w-3.5" /> Stats</TabsTrigger>
            <TabsTrigger value="members" class="gap-1.5">
              <Users class="h-3.5 w-3.5" /> Members
              <Badge v-if="!membersHidden" variant="outline" class="tabular-nums">{{ members.length }}</Badge>
              <Badge v-if="joinRequestCount > 0" variant="warn" class="tabular-nums" title="Pending join requests">{{ joinRequestCount }}</Badge>
            </TabsTrigger>
            <TabsTrigger value="roles" class="gap-1.5">
              <ShieldCheck class="h-3.5 w-3.5" /> Roles
              <Badge variant="outline" class="tabular-nums">{{ group.roles.length }}</Badge>
            </TabsTrigger>
            <TabsTrigger v-if="isMember" value="sources" class="gap-1.5">
              <Cable class="h-3.5 w-3.5" /> Data sources
              <Badge v-if="connectorCount !== null" variant="outline" class="tabular-nums">{{ connectorCount }}</Badge>
            </TabsTrigger>
            <TabsTrigger v-if="policiesTabVisible" value="policies" class="gap-1.5">
              <ShieldAlert class="h-3.5 w-3.5" /> Policies
            </TabsTrigger>
            <TabsTrigger v-if="canAdminStorage" value="storage" class="gap-1.5">
              <Database class="h-3.5 w-3.5" /> Storage
              <Badge v-if="backendCount !== null" variant="outline" class="tabular-nums">{{ backendCount }}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stats" class="mt-0">
      <div v-if="usage" class="border-b border-border">
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <FileJson2 class="h-3.5 w-3.5 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Live documents</h2>
        </div>
        <dl class="grid grid-cols-3 gap-3 px-5 py-3">
          <div v-for="count in purposeCounts" :key="count.label" class="rounded-md border border-border bg-background px-3 py-2">
            <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ count.label }}</dt>
            <dd class="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">{{ purposeCountLabel(count.value) }}</dd>
          </div>
        </dl>
      </div>
      <div v-if="usage" id="storage" class="scroll-mt-24 border-b border-border">
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <HardDrive class="h-3.5 w-3.5 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage</h2>
          <Badge v-if="quotaBadge" size="sm" :variant="quotaBadge.variant" class="uppercase">{{ quotaBadge.label }}</Badge>
        </div>
        <div class="px-5 py-3">
          <!-- Old backend: usage but no quota block. Do NOT claim unlimited. -->
          <div v-if="!quotaStatus" class="flex items-center justify-between text-[11px]">
            <span class="font-medium text-muted-foreground">Group storage</span>
            <span class="tabular-nums text-foreground/80">
              {{ formatBytes(usedBytes) }}<template v-if="referenceBytes"> · {{ formatBytes(referenceBytes) }} referenced (not counted)</template>
            </span>
          </div>
          <QuotaBar
            v-else-if="quotaStatus.quota_bytes == null"
            :used="usedBytes"
            :quota="null"
            :referenced="referenceBytes"
            label="Group storage"
          />
          <QuotaBar
            v-else
            :used="usedBytes"
            :quota="quotaStatus.quota_bytes"
            :ceiling="quotaStatus.ceiling_bytes"
            :referenced="referenceBytes"
            :warn="quotaStatus.warning"
            label="Group storage"
          />
          <p v-if="objectCounts" class="mt-1 text-[11px] tabular-nums text-muted-foreground">
            Objects: {{ formatNumber(objectCounts.total) }} total · {{ formatNumber(objectCounts.physicalBlobs) }} physical blob locations
          </p>
          <p v-if="quotaStatus && quotaStatus.ceiling_bytes != null" class="mt-1 text-[11px] text-muted-foreground">
            Hard cap {{ formatBytes(quotaStatus.ceiling_bytes) }}.
          </p>
          <p v-if="quotaAssessment.state === 'over-quota'" class="mt-1 text-[11px] text-muted-foreground">
            Writes are accepted until the hard cap; above it the node rejects uploads (QuotaExceeded).
          </p>
          <p v-else-if="quotaAssessment.state === 'over-ceiling'" class="mt-1 text-[11px] text-destructive">
            The node is rejecting uploads for this group (QuotaExceeded). Free storage or ask a realm admin to raise the quota.
          </p>
        </div>
      </div>

      <div v-if="usageHistoryEnabled" class="border-b border-border">
        <div class="flex flex-wrap items-center justify-between gap-2 px-5 pb-1 pt-4">
          <div class="flex items-center gap-2">
            <ChartArea class="h-3.5 w-3.5 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Usage history</h2>
          </div>
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
        </div>
        <div class="px-5 py-3">
          <Skeleton v-if="historyLoading && !historyPoints" class="h-36" />
          <div
            v-else-if="historyUnsupported"
            class="rounded-md border border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground"
          >
            This backend does not serve usage history yet. The chart appears once snapshot recording ships (aruna#250).
          </div>
          <ErrorPanel v-else-if="historyError" :message="historyError" @retry="loadHistory" />
          <EmptyState
            v-else-if="!historyPoints || historyPoints.length < 2"
            title="No usage history yet"
            description="Snapshots appear once the server starts recording them."
          />
          <template v-else>
            <div :class="historyLoading ? 'opacity-60 transition-opacity' : ''">
              <UsageHistoryChart
                :points="historyPoints"
                :quota-bytes="quotaStatus?.quota_bytes"
                :ceiling-bytes="quotaStatus?.ceiling_bytes"
              />
            </div>
            <p class="mt-2 text-[11px] text-muted-foreground">Logical bytes, the counter quotas are enforced against.</p>
          </template>
        </div>
      </div>

      <div>
        <div class="flex items-center gap-2 px-5 pb-1 pt-4">
          <FileJson2 class="h-3.5 w-3.5 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Documents</h2>
          <Badge
            v-if="docs"
            variant="outline"
            class="tabular-nums"
            :title="docsEstimate !== null ? 'Approximate: the server estimates this count per group.' : undefined"
          >
            {{ docsCountLabel }}
          </Badge>
        </div>
        <div class="px-5 py-3">
          <p v-if="docsLoading && !docs" class="text-xs text-muted-foreground">Loading documents…</p>
          <p v-else-if="docsError" class="text-xs text-destructive">{{ docsError }}</p>
          <p v-else-if="docs && !docs.length" class="text-xs text-muted-foreground">This group has no metadata documents yet.</p>
          <ul v-else-if="docs" class="space-y-1">
            <li v-for="doc in docs.slice(0, DOC_LIMIT)" :key="doc.document_id">
              <RouterLink :to="{ name: 'dataset', params: { id: doc.document_id } }" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">{{ doc.document_path }}</span>
                <Badge size="sm" :variant="doc.public ? 'success' : 'secondary'" class="shrink-0 uppercase">{{ doc.public ? 'public' : 'private' }}</Badge>
                <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(doc.updated_at) }}</span>
              </RouterLink>
            </li>
          </ul>
          <RouterLink
            v-if="moreDocs"
            :to="{ name: 'datasets', query: { group: group.group_id } }"
            class="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
          >
            View all in Discover{{ docsEstimate !== null ? ` (about ${formatNumber(docsEstimate)})` : '' }} →
          </RouterLink>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="members" class="mt-0">
          <div :class="canManage && joinRequestsEnabled ? 'border-b border-border' : ''">
            <div v-if="membersHidden" class="px-5 py-4 text-xs text-muted-foreground">
              The member list is only visible to group members.
            </div>
            <GroupMembers
              v-else
              :group-id="group.group_id"
              :members="members"
              :roles="group.roles"
              :can-manage="canManage"
              @changed="reload"
            />
          </div>

          <div v-if="canManage && joinRequestsEnabled">
            <div class="flex items-center gap-2 px-5 pb-1 pt-4">
              <Inbox class="h-3.5 w-3.5 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Join requests</h2>
              <Badge v-if="joinRequestCount > 0" variant="warn" class="tabular-nums">{{ joinRequestCount }}</Badge>
              <Badge v-else variant="outline" class="tabular-nums">0</Badge>
            </div>
            <JoinRequestsInbox
              :group-id="group.group_id"
              :roles="group.roles"
              @changed="reload"
              @count="joinRequestCount = $event"
            />
          </div>
        </TabsContent>

        <TabsContent value="roles" class="mt-0">
          <GroupRoles :group="group" :can-manage="canManage" @changed="reload" />
        </TabsContent>

        <TabsContent v-if="isMember" value="sources" class="mt-0">
          <ConnectorsSection
            :group-id="group.group_id"
            :can-write="canWriteData"
            @count="connectorCount = $event"
          />
        </TabsContent>

        <TabsContent v-if="policiesTabVisible" value="policies" class="mt-0">
          <div class="space-y-8 px-5 py-4">
            <PoliciesSection scope="group" :group-id="group.group_id" :can-admin="canAdminGroup" />
            <EffectivePolicies :group-id="group.group_id" />
          </div>
        </TabsContent>

        <TabsContent v-if="canAdminStorage" value="storage" class="mt-0">
          <div class="border-b border-border">
            <div class="flex items-center gap-2 px-5 pb-1 pt-4">
              <Database class="h-3.5 w-3.5 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage backends</h2>
            </div>
            <StorageBackendsSection
              :group-id="group.group_id"
              :can-admin="canAdminStorage"
              @count="backendCount = $event"
              @backends="groupBackends = $event"
            />
          </div>
          <div>
            <div class="flex items-center gap-2 px-5 pb-1 pt-4">
              <Route class="h-3.5 w-3.5 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage routing</h2>
            </div>
            <div class="px-5 py-3">
              <GroupRoutingSection
                :group-id="group.group_id"
                :backends="groupBackends"
                :can-admin="canAdminStorage"
              />
              <p class="mt-2 text-[11px] text-muted-foreground">
                Rules for a single bucket live with that bucket: open it in the Data manager and
                choose Routing.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>
