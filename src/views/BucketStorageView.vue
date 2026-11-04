<script setup lang="ts">
// One settings page per bucket: a summary line, the description and releases, where its data
// goes (Storage), who may read it, its encryption and how files got in. Policy parts are gated
// by what the node will let this viewer write.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import BucketAccessTab from '@/components/storage/BucketAccessTab.vue'
import BucketBackendTab from '@/components/storage/BucketBackendTab.vue'
import BucketCheckSection from '@/components/storage/BucketCheckSection.vue'
import BucketLinkNote from '@/components/storage/BucketLinkNote.vue'
import BucketComplianceSection from '@/components/storage/BucketComplianceSection.vue'
import BucketDeleteSection from '@/components/storage/BucketDeleteSection.vue'
import AccessTab from '@/components/distributed/AccessTab.vue'
import GrantGuide from '@/components/distributed/GrantGuide.vue'
import BucketNodesTab from '@/components/storage/BucketNodesTab.vue'
import BucketEncryptionTab from '@/components/storage/BucketEncryptionTab.vue'
import BucketPolicySection from '@/components/storage/BucketPolicySection.vue'
import DistributionOverview from '@/components/storage/DistributionOverview.vue'
import SetDeleteSection from '@/components/storage/SetDeleteSection.vue'
import BucketSources from '@/components/storage/BucketSources.vue'
import LinkedDatasets from '@/components/data/LinkedDatasets.vue'
import BucketMetadataSection from '@/components/storage/BucketMetadataSection.vue'
import CopiesOfBucket from '@/components/storage/CopiesOfBucket.vue'
import FileSources from '@/components/storage/FileSources.vue'
import TransfersTab from '@/components/storage/TransfersTab.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketDistribution } from '@/composables/useBucketDistribution'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRouteTab } from '@/composables/useRouteTab'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useS3 } from '@/composables/useS3'
import { mockEnabled } from '@/lib/distributedMock'
import { mockBucket } from '@/lib/distributedMockData'
import { isMulti } from '@/lib/distribution'
import { isGroupAdmin } from '@/lib/groupAdmin'
import type { BucketUsageResponse, GroupDetailResponse } from '@/lib/api'
import { formatBytes, formatNumber } from '@/lib/utils'
import { ChevronLeft } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { currentUser, getGroup, getBucketUsage, isRealmAdmin, searchBuckets, sessionEpoch } = useAruna()
const { shown } = usePortalFeatures()
const { activeContext } = useS3()
const realmNodes = useRealmNodes()

const bucket = computed(() => String(route.params.bucketId ?? ''))
const nodeId = computed(() => {
  const value = route.query.node
  return typeof value === 'string' && value && !realmNodes.isLocalNode(value) ? value : null
})
const groupId = computed(() => {
  const value = route.query.group
  if (typeof value === 'string' && value) return value
  return activeContext.value?.groupId ?? null
})

// A link without a node names a bucket of any node: the realm's bucket search names its holder.
const resolving = ref(false)
let resolveRun = 0
watch([bucket, () => route.query.node, sessionEpoch], async ([name, node]) => {
  const run = ++resolveRun
  resolving.value = false
  if (node || !name || mockEnabled()) return
  resolving.value = true
  const scope = groupId.value
  const found = await searchBuckets(name, { limit: 50, groupId: scope || undefined }).catch(() => null)
  if (run !== resolveRun) return
  const hits = (found?.hits ?? []).filter((hit) => hit.bucket === name && (!scope || hit.group_id === scope))
  const holder = hits.some((hit) => realmNodes.isLocalNode(hit.node_id)) ? null : hits[0]
  if (holder) await router.replace({ query: { ...route.query, node: holder.node_id, group: scope || holder.group_id } })
  if (run === resolveRun) resolving.value = false
}, { immediate: true })

const group = ref<GroupDetailResponse | null>(null)
watch(
  groupId,
  async (id) => {
    group.value = null
    if (!id) return
    group.value = await getGroup(id).catch(() => null)
  },
  { immediate: true },
)

// An example bucket of the node mock. It has no session behind it, so only its own tabs show.
const example = computed(() => (mockEnabled() ? mockBucket(bucket.value) : undefined))
// A bucket of this node that is stored on more nodes, as the node reports it.
const distribution = useBucketDistribution(bucket, nodeId)
const live = computed(() => (example.value ? null : distribution.view.value))
const nodes = computed(() => example.value ?? live.value ?? undefined)
const nodesTab = computed(() => Boolean(nodes.value && isMulti(nodes.value)))
// Who keeps the bucket's sources and imports: every member of a distributed bucket, else its node.
const ownerNodes = computed<(string | null)[] | null>(() => {
  const members = live.value?.members.map((member) => member.nodeId) ?? []
  if (members.length) return [...new Set(members)].map((id) => (realmNodes.isLocalNode(id) ? null : id))
  return distribution.state.value === 'loading' ? null : [nodeId.value]
})
const canAdminGroup = computed(() => isGroupAdmin(group.value, currentUser.value?.id ?? ''))
// The node of the bucket answers for its settings, so they show for a bucket of any node.
const backendVisible = computed(() => canAdminGroup.value)
const placementVisible = computed(() => canAdminGroup.value || isRealmAdmin.value)
// The member nodes of a distributed bucket; each keeps its own storage rules and placement default.
const memberNodes = computed(() => [...new Set(live.value?.members.map((member) => member.nodeId) ?? [])])
// The default is applied where a range is written, so coordinators come first and are read from.
const placementNodes = computed<(string | null)[]>(() => {
  if (!memberNodes.value.length) return [nodeId.value]
  const coordinators = live.value?.ranges.map((range) => range.coordinator) ?? []
  const ordered = [...new Set([...coordinators, ...memberNodes.value])]
  return ordered.map((id) => (realmNodes.isLocalNode(id) ? null : id))
})
// A hidden feature loses its tab trigger only; a deep link still opens the tab.
const placementTrigger = computed(() => placementVisible.value && shown('placement'))

// Storage holds the backend rules, placement and the file check; old links to their tabs land there.
const storageVisible = computed(() => backendVisible.value || placementVisible.value)
const TAB_IDS = ['overview', 'nodes', 'storage', 'backend', 'placement', 'access', 'encryption', 'transfers']
const routeTab = useRouteTab(TAB_IDS, 'overview')
const tab = computed({
  get() {
    const value = routeTab.value === 'backend' || routeTab.value === 'placement' ? 'storage' : routeTab.value
    if (example.value && !['overview', 'nodes', 'transfers', 'access'].includes(value)) return 'overview'
    if (value === 'nodes' && !nodesTab.value) return 'overview'
    if (value === 'storage' && !storageVisible.value) return 'overview'
    if (value === 'access' && !groupId.value && !example.value) return 'overview'
    return value
  },
  set(next: string) {
    routeTab.value = next
  },
})

// The summary line: size, files and the nodes; delete markers and open uploads only when there are any.
const usage = ref<BucketUsageResponse | null>(null)
let usageRun = 0
watch([bucket, nodeId, sessionEpoch], async ([name, node]) => {
  const run = ++usageRun
  usage.value = null
  if (example.value || !name) return
  const counted = await getBucketUsage(name, node).catch(() => null)
  if (run === usageRun) usage.value = counted
}, { immediate: true })
const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`
const summary = computed(() => {
  const held = usage.value
  const parts: string[] = []
  if (held) {
    const lower = held.complete ? '' : 'at least '
    parts.push(`${lower}${formatBytes(held.logical_bytes)} stored`)
    if (held.referenced_bytes) parts.push(`${lower}${formatBytes(held.referenced_bytes)} referenced`)
    parts.push(`${lower}${plural(held.objects, 'file', 'files')}`)
    if (held.delete_markers) parts.push(plural(held.delete_markers, 'delete marker', 'delete markers'))
    if (held.open_multipart_uploads) parts.push(plural(held.open_multipart_uploads, 'open multipart upload', 'open multipart uploads'))
  }
  const where = memberNodes.value.length ? memberNodes.value : [nodeId.value]
  const names = where.map((id) => realmNodes.displayName(id))
  parts.push(`on ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}`)
  return parts.join(', ')
})

const browserLink = computed(() => ({
  name: 'bucket',
  params: { bucketId: bucket.value },
  query: {
    ...(nodeId.value ? { node: nodeId.value } : {}),
    ...(groupId.value ? { group: groupId.value } : {}),
  },
}))
</script>

<template>
  <div>
    <PageHeader
      :title="bucket"
      :description="resolving ? undefined : summary"
      :crumbs="[{ label: bucket, to: browserLink }, { label: 'Settings' }]"
      :docs="{ topic: 'where-data-lives', section: 'Buckets' }"
    >
      <template #actions>
        <Button size="sm" variant="outline" as-child>
          <RouterLink :to="browserLink"><ChevronLeft class="size-4" /> Back to the files</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <Spinner v-if="resolving" label="Finding the node of this bucket" class="m-6" />
    <Tabs v-else v-model="tab" class="w-full px-4 sm:px-6 space-y-5 py-6">
      <div class="overflow-x-auto">
        <TabsList aria-label="Bucket settings sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger v-if="nodesTab" value="nodes">Nodes</TabsTrigger>
          <TabsTrigger v-if="(backendVisible || placementTrigger) && !example" value="storage">Storage</TabsTrigger>
          <TabsTrigger v-if="groupId || example" value="access">Access</TabsTrigger>
          <TabsTrigger v-if="!example" value="encryption">Encryption</TabsTrigger>
          <TabsTrigger value="transfers">Sources and transfers</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" class="mt-0 space-y-5">
        <DistributionOverview v-if="example" :bucket="example" />
        <BucketLinkNote v-else-if="!nodeId" :bucket="bucket" :group-id="groupId" />
        <DistributionOverview v-if="live" :bucket="live" />
        <BucketMetadataSection v-if="!example" :bucket="bucket" :node-id="nodeId" :can-admin="canAdminGroup" />
        <LinkedDatasets v-if="!example" heading="Linked by datasets" card quiet-empty :target="{ bucket, key: '', folder: true, node: nodeId }" />
        <Notice v-if="!example && distribution.error.value" tone="error">
          How this bucket is stored could not be read: {{ distribution.error.value }}
        </Notice>
        <!-- A bucket still loading or unreadable is not taken for an ordinary one. -->
        <details v-if="live || nodeId || distribution.state.value === 'ordinary'" class="surface">
          <summary class="cursor-pointer px-5 py-4 text-sm font-semibold text-destructive">Delete bucket</summary>
          <SetDeleteSection v-if="live" bare :bucket="live" :admin="canAdminGroup" @changed="distribution.reload" />
          <BucketDeleteSection v-else bare :bucket="bucket" :group-id="groupId" :node-id="nodeId" />
        </details>
      </TabsContent>

      <TabsContent v-if="nodes && nodesTab" value="nodes" class="mt-0">
        <BucketNodesTab :bucket="nodes" :admin="canAdminGroup" :busy="distribution.state.value === 'loading'" @reload="distribution.reload" />
      </TabsContent>

      <TabsContent v-if="storageVisible" value="storage" class="mt-0 space-y-5">
        <BucketBackendTab v-if="backendVisible" :bucket="bucket" :group-id="groupId" :node-id="nodeId" :members="memberNodes" />
        <template v-if="placementVisible">
          <BucketPolicySection
            :bucket="bucket"
            :group-id="groupId"
            :group-name="group?.display_name ?? null"
            :can-publish-for-group="canAdminGroup"
            :can-publish-for-realm="isRealmAdmin && !canAdminGroup"
            :nodes="placementNodes"
          />
          <BucketComplianceSection
            :bucket="bucket"
            :node-id="nodeId"
            :can-apply="canAdminGroup || isRealmAdmin"
            blocked-reason="Only group admins of this bucket and realm admins may apply the rules."
          />
        </template>
        <BucketCheckSection v-if="canAdminGroup" :bucket="bucket" :node-id="nodeId" />
      </TabsContent>

      <TabsContent v-if="groupId || example" value="access" class="mt-0 space-y-5">
        <AccessTab v-if="example" :bucket="example" />
        <GrantGuide v-if="live?.live" :live="live.live" />
        <BucketAccessTab v-if="groupId && !example" :bucket="bucket" :group-id="groupId" :node-id="nodeId" />
      </TabsContent>

      <TabsContent value="encryption" class="mt-0">
        <BucketEncryptionTab :bucket="bucket" :node-id="nodeId" :group-id="groupId" />
      </TabsContent>

      <TabsContent value="transfers" class="mt-0 space-y-5">
        <FileSources v-if="example" :bucket="bucket" />
        <BucketSources v-else :bucket="bucket" :nodes="ownerNodes" :group-id="groupId" />
        <CopiesOfBucket v-if="example" :bucket="bucket" />
        <TransfersTab
          v-else
          :bucket="bucket"
          :node-id="nodeId"
          :owner-nodes="ownerNodes"
          :group-id="groupId"
          :focus-sync="typeof route.query.sync === 'string' ? route.query.sync : null"
        />
      </TabsContent>
    </Tabs>
  </div>
</template>
