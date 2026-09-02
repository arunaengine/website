<script setup lang="ts">
// One page per bucket for everything about where its data goes and where it
// already is. Policy tabs are gated by what the node will let this viewer
// write; the overview and the sync list are readable by anyone who reads the
// bucket, and every observed line names the node it came from.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Notice from '@/components/ui/Notice.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import SyncBucketDialog from '@/components/data/SyncBucketDialog.vue'
import BucketBackendTab from '@/components/storage/BucketBackendTab.vue'
import BucketComplianceSection from '@/components/storage/BucketComplianceSection.vue'
import BucketPolicySection from '@/components/storage/BucketPolicySection.vue'
import StorageOverviewTab from '@/components/storage/StorageOverviewTab.vue'
import SyncsTab from '@/components/storage/SyncsTab.vue'
import { useAruna } from '@/composables/useAruna'
import { useBuckets } from '@/composables/useBuckets'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRouteTab } from '@/composables/useRouteTab'
import { useS3 } from '@/composables/useS3'
import { isGroupAdmin } from '@/lib/groupAdmin'
import type { GroupDetailResponse } from '@/lib/api'
import type { DeletionResult } from '@/lib/deletion/request'
import { ChevronLeft } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { currentUser, getGroup, isRealmAdmin } = useAruna()
const { activeContext } = useS3()
const realmNodes = useRealmNodes()
const bucketList = useBuckets()
const shortcuts = useBucketShortcuts()

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

const canAdminGroup = computed(() => isGroupAdmin(group.value, currentUser.value?.id ?? ''))
const local = computed(() => !nodeId.value)
const backendVisible = computed(() => local.value && canAdminGroup.value)
const placementVisible = computed(() => local.value && (canAdminGroup.value || isRealmAdmin.value))

const TAB_IDS = ['overview', 'backend', 'placement', 'syncs']
const routeTab = useRouteTab(TAB_IDS, 'overview')
const tab = computed({
  get() {
    const value = routeTab.value
    if (value === 'backend' && !backendVisible.value) return 'overview'
    if (value === 'placement' && !placementVisible.value) return 'overview'
    return value
  },
  set(next: string) {
    routeTab.value = next
  },
})

const syncDialogOpen = ref(false)
const syncReloadKey = ref(0)

function onSyncCreated() {
  syncDialogOpen.value = false
  syncReloadKey.value += 1
}

// The page it describes is gone, so it leaves for the list the same way the
// data manager does after a bucket delete.
async function onBucketDeleted(result: DeletionResult) {
  if (!result.committed.length) return
  shortcuts.remove(bucket.value, nodeId.value)
  await router.push({ name: 'buckets', query: groupId.value ? { group: groupId.value } : {} })
  await bucketList.refresh()
}

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
    <PageHeader :title="`Storage for ${bucket}`">
      <template #description>
        Where new uploads go, which rules apply, and what this node can see.
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
        <TabsList aria-label="Bucket storage sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger v-if="backendVisible" value="backend">Storage backend</TabsTrigger>
          <TabsTrigger v-if="placementVisible" value="placement">Placement</TabsTrigger>
          <TabsTrigger value="syncs">Syncs</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" class="mt-0">
        <StorageOverviewTab
          :bucket="bucket"
          :group-id="groupId"
          :node-id="nodeId"
          @deleted="onBucketDeleted"
        />
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

      <TabsContent value="syncs" class="mt-0">
        <Notice v-if="nodeId" tone="info" class="mb-3">
          This bucket is hosted on {{ realmNodes.displayName(nodeId) }}, so this node can only show
          the syncs you created for it.
        </Notice>
        <SyncsTab
          :key="syncReloadKey"
          :bucket="bucket"
          :node-id="nodeId"
          @new-sync="syncDialogOpen = true"
        />
      </TabsContent>
    </Tabs>

    <SyncBucketDialog
      v-model:open="syncDialogOpen"
      :source-bucket="bucket"
      source-prefix=""
      :source-node-id="nodeId"
      @created="onSyncCreated"
    />
  </div>
</template>
