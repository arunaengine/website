<script setup lang="ts">
// One settings page per bucket: what it holds, where its data goes and where
// it already is. Policy tabs are gated by what the node will let this viewer
// write; the overview and the sync list are readable by anyone who reads the
// bucket, and every observed line names the node it came from.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import BucketAccessTab from '@/components/storage/BucketAccessTab.vue'
import BucketBackendTab from '@/components/storage/BucketBackendTab.vue'
import BucketComplianceSection from '@/components/storage/BucketComplianceSection.vue'
import BucketDeleteSection from '@/components/storage/BucketDeleteSection.vue'
import AccessTab from '@/components/distributed/AccessTab.vue'
import BucketNodesTab from '@/components/storage/BucketNodesTab.vue'
import BucketEncryptionTab from '@/components/storage/BucketEncryptionTab.vue'
import BucketPolicySection from '@/components/storage/BucketPolicySection.vue'
import MockOverview from '@/components/storage/MockOverview.vue'
import LinkedBy from '@/components/storage/LinkedBy.vue'
import DatabaseMark from '@/components/storage/DatabaseMark.vue'
import CopiesOfBucket from '@/components/storage/CopiesOfBucket.vue'
import FileSources from '@/components/storage/FileSources.vue'
import StorageOverviewTab from '@/components/storage/StorageOverviewTab.vue'
import TransfersTab from '@/components/storage/TransfersTab.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRouteTab } from '@/composables/useRouteTab'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useS3 } from '@/composables/useS3'
import { mockEnabled } from '@/lib/distributedMock'
import { isMulti, mockBucket } from '@/lib/distributedMockData'
import { isGroupAdmin } from '@/lib/groupAdmin'
import type { GroupDetailResponse } from '@/lib/api'
import { ChevronLeft } from '@lucide/vue'

const route = useRoute()
const { currentUser, getGroup, isRealmAdmin } = useAruna()
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
const nodesTab = computed(() => Boolean(example.value && isMulti(example.value)))
const canAdminGroup = computed(() => isGroupAdmin(group.value, currentUser.value?.id ?? ''))
const local = computed(() => !nodeId.value)
const backendVisible = computed(() => local.value && canAdminGroup.value)
const placementVisible = computed(() => local.value && (canAdminGroup.value || isRealmAdmin.value))
// A hidden feature loses its tab trigger only; a deep link still opens the tab.
const placementTrigger = computed(() => placementVisible.value && shown('placement'))

const TAB_IDS = ['overview', 'nodes', 'backend', 'placement', 'access', 'encryption', 'transfers']
const routeTab = useRouteTab(TAB_IDS, 'overview')
const tab = computed({
  get() {
    const value = routeTab.value
    if (example.value && !['overview', 'nodes', 'transfers', 'access'].includes(value)) return 'overview'
    if (value === 'nodes' && !nodesTab.value) return 'overview'
    if (value === 'backend' && !backendVisible.value) return 'overview'
    if (value === 'placement' && !placementVisible.value) return 'overview'
    if (value === 'access' && !groupId.value && !example.value) return 'overview'
    return value
  },
  set(next: string) {
    routeTab.value = next
  },
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
    <PageHeader :title="`Settings for ${bucket}`" :docs="{ topic: 'where-data-lives', section: 'Buckets' }">
      <template #description>
        What this bucket holds, where new uploads go, which rules apply, and what this node can see.
        <DocsLink icon topic="where-data-lives" class="ml-0.5" />
      </template>
      <template #breadcrumbs>
        <span>·</span>
        <RouterLink :to="browserLink" class="hover:underline">Data</RouterLink>
        <span>·</span>
        <span class="font-mono">{{ bucket }}</span>
        <Badge v-if="nodeId" variant="outline" size="sm" :title="nodeId">
          on {{ realmNodes.displayName(nodeId) }}
        </Badge>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="browserLink"><ChevronLeft class="size-3.5" /> Back to the files</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <Tabs v-model="tab" class="container space-y-5 py-6">
      <div class="overflow-x-auto">
        <TabsList aria-label="Bucket settings sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger v-if="nodesTab" value="nodes">Nodes</TabsTrigger>
          <TabsTrigger v-if="backendVisible && !example" value="backend">Storage backend</TabsTrigger>
          <TabsTrigger v-if="placementTrigger && !example" value="placement">Placement</TabsTrigger>
          <TabsTrigger v-if="groupId || example" value="access">Access</TabsTrigger>
          <TabsTrigger v-if="!example" value="encryption">Encryption</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" class="mt-0 space-y-5">
        <MockOverview v-if="example" :bucket="example" />
        <StorageOverviewTab v-else :bucket="bucket" :group-id="groupId" :node-id="nodeId" />
        <FileSources v-if="example" :bucket="bucket" />
        <LinkedBy v-if="example" :bucket="bucket" />
        <DatabaseMark v-if="example" :bucket="bucket" />
        <BucketDeleteSection :bucket="bucket" :group-id="groupId" :node-id="nodeId" />
      </TabsContent>

      <TabsContent v-if="example && nodesTab" value="nodes" class="mt-0">
        <BucketNodesTab :bucket="example" />
      </TabsContent>

      <TabsContent v-if="backendVisible" value="backend" class="mt-0">
        <BucketBackendTab :bucket="bucket" :group-id="groupId" />
      </TabsContent>

      <TabsContent v-if="placementVisible" value="placement" class="mt-0 space-y-5">
        <BucketPolicySection
          :bucket="bucket"
          :group-id="groupId"
          :group-name="group?.display_name ?? null"
          :can-publish-for-group="canAdminGroup"
          :can-publish-for-realm="isRealmAdmin && !canAdminGroup"
        />
        <BucketComplianceSection
          :bucket="bucket"
          :can-apply="canAdminGroup || isRealmAdmin"
          blocked-reason="Only group admins of this bucket and realm admins may apply the rules."
        />
      </TabsContent>

      <TabsContent v-if="groupId || example" value="access" class="mt-0 space-y-5">
        <AccessTab v-if="example" :bucket="example" />
        <BucketAccessTab v-if="groupId && !example" :bucket="bucket" :group-id="groupId" :node-id="nodeId" />
      </TabsContent>

      <TabsContent value="encryption" class="mt-0">
        <BucketEncryptionTab :bucket="bucket" :node-id="nodeId" :group-id="groupId" />
      </TabsContent>

      <TabsContent value="transfers" class="mt-0">
        <CopiesOfBucket v-if="example" :bucket="bucket" />
        <TransfersTab v-else :bucket="bucket" :node-id="nodeId" :group-id="groupId" />
      </TabsContent>
    </Tabs>
  </div>
</template>
