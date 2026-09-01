<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Notice from '@/components/ui/Notice.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import DataViewSkeleton from '@/components/data/DataViewSkeleton.vue'
import StagingJobsPanel from '@/components/data/StagingJobsPanel.vue'
import SyncBucketDialog from '@/components/data/SyncBucketDialog.vue'
import BucketSidebar from '@/components/data/manager/BucketSidebar.vue'
import DeleteDialog from '@/components/data/DeleteDialog.vue'
import FileDetailsDialog from '@/components/data/FileDetailsDialog.vue'
import ObjectBrowser from '@/components/data/manager/ObjectBrowser.vue'
import UploadPanel from '@/components/data/manager/UploadPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useDataManager } from '@/composables/useDataManager'
import { providePageContext } from '@/composables/usePageContext'
import { useStaging } from '@/composables/useStaging'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { folderNameProblem } from '@/lib/bucketName'
import { featureEnabled } from '@/lib/config'
import { isDesktop } from '@/lib/desktop'
import type { BucketSearchHit } from '@/lib/api'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { HardDriveDownload, KeyRound, LogIn, ShieldAlert } from '@lucide/vue'

const { bootstrapped, currentUser } = useAruna()
const s3 = useS3()
const desktop = isDesktop()

const manager = useDataManager()
const {
  route,
  router,
  bucket,
  s3Prefix,
  remoteNodeId,
  realmNodes,
  selectedGroupId,
  selectedGroupName,
  groupsLoading,
  hasGroups,
  contextBusy,
  contextError,
  contextHold,
  contextReady,
  viewReady,
  requiredNodeId,
  requiredNodeName,
  sessionWarning,
  keyTail,
  openSelectedContext,
  activeGroupId,
  canWriteCurrentPrefix,
  listedKeys,
  references,
  loadObjects,
  loadSyncOverview,
  bucketList,
  detailsKey,
  detailsTab,
  detailsObject,
  setDetailsTab,
  closeDetails,
  previewReferencedFrom,
  previewProbeReference,
  deleteRequest,
  deleteSyncApplies,
  requestDelete,
  closeDelete,
  onDeleteCompleted,
  refreshSpinning,
  onRefresh,
} = manager

providePageContext(() => ({
  kind: 'data manager',
  title: bucket.value ? `${bucket.value}/${s3Prefix.value}` : 'No bucket open',
  facts: {
    group: selectedGroupId.value,
    bucket: bucket.value,
    prefix: s3Prefix.value,
    'listed objects': String(listedKeys.value.size),
  },
}))

// Bumped after every deletion so the open file details reload their panels.
const detailsRevision = ref(0)

async function onDeleted(result: Parameters<typeof onDeleteCompleted>[0]) {
  await onDeleteCompleted(result)
  detailsRevision.value += 1
}

// ── Bucket sync ─────────────────────────────────────────────────────────────
const syncDialogOpen = ref(false)
const syncSource = ref<{ bucket: string; prefix: string; nodeId: string | null }>({
  bucket: '',
  prefix: '',
  nodeId: null,
})

function openSyncDialog() {
  syncSource.value = { bucket: bucket.value, prefix: s3Prefix.value, nodeId: remoteNodeId.value }
  syncDialogOpen.value = true
}

// "Sync to this node…" on a remote search hit: remote source → local target.
function openSyncFromHit(hit: BucketSearchHit) {
  syncSource.value = {
    bucket: hit.bucket,
    prefix: '',
    nodeId: realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id,
  }
  syncDialogOpen.value = true
}

function onSyncChanged() {
  void bucketList.refresh()
  void loadSyncOverview()
}

const addDataOpen = ref(false)
// The Add data browser may open another node or group; the view takes its
// own session back once the dialog closes.
watch(addDataOpen, (open) => {
  contextHold.value = open
})
const staging = useStaging()
// Staging jobs side panel: config-gated (no job-listing endpoint on today's
// backend). The dialog's connector tab covers registered connectors regardless.
const stagingJobsEnabled = featureEnabled('stagingJobs')
const stagingPanelOpen = ref(false)

// The retired bucket-builder route redirects here with ?addData=1 so old links
// land in the consolidated dialog; strip the marker once consumed.
watch(
  () => route.query.addData,
  (flag) => {
    if (flag === undefined) return
    if (flag === '1') addDataOpen.value = true
    const { addData: _addData, ...rest } = route.query
    void router.replace({ query: rest })
  },
  { immediate: true },
)

const newFolderOpen = ref(false)
const newFolderName = ref('')
const newFolderBusy = ref(false)
const newFolderError = ref<string | null>(null)
// An empty name is invalid too, but says nothing until a person types.
const newFolderProblem = computed(() => folderNameProblem(newFolderName.value.trim()))
const newFolderInvalid = computed(() => Boolean(newFolderProblem.value))

function openNewFolder() {
  if (!canWriteCurrentPrefix.value) return
  newFolderName.value = ''
  newFolderError.value = null
  newFolderOpen.value = true
}

async function createFolder() {
  if (newFolderInvalid.value || newFolderBusy.value) return
  newFolderBusy.value = true
  newFolderError.value = null
  const targetBucket = bucket.value
  const targetPrefix = s3Prefix.value
  const targetKey = `${targetPrefix}${newFolderName.value.trim()}/`
  if (!s3.canWrite(targetBucket, targetKey, remoteNodeId.value)) {
    newFolderError.value = 'This session does not allow creating that folder.'
    return
  }
  try {
    await s3.createFolder(targetBucket, targetPrefix, newFolderName.value.trim(), remoteNodeId.value)
    newFolderOpen.value = false
    if (targetBucket === bucket.value && targetPrefix === s3Prefix.value) await loadObjects()
  } catch (err) {
    newFolderError.value = s3ErrorMessage(err)
  } finally {
    newFolderBusy.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="route.name === 'bucket' ? bucket : 'Data'"
      description="Browse buckets and objects through the node's S3 interface, signed in your browser."
    >
      <template #actions>
        <template v-if="currentUser && s3.connectedEndpoint.value">
          <!-- The group is the top bar's context; here it only stays visible. -->
          <div class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span class="hidden lg:inline">Showing buckets of</span>
            <RouterLink
              v-if="selectedGroupId"
              :to="{ name: 'group', params: { id: selectedGroupId } }"
              class="max-w-[12rem] truncate font-medium text-foreground hover:underline"
              :title="`${selectedGroupId} · Switch the group in the top bar`"
            >
              {{ selectedGroupName }}
            </RouterLink>
            <span v-else class="text-muted-foreground">No group</span>
            <span class="hidden lg:inline" :title="requiredNodeId ?? undefined">on {{ requiredNodeName }}</span>
          </div>
        </template>
        <template v-if="contextReady">
          <span
            class="flex items-center gap-1 font-mono text-[11px] text-muted-foreground"
            :title="`Temporary session ${s3.activeKey.value?.accessKeyId} for group ${activeGroupId} on node ${requiredNodeId}`"
          >
            <KeyRound class="h-3 w-3" /> …{{ keyTail }}
          </span>
          <RefreshButton :busy="refreshSpinning" @click="onRefresh" />
          <!-- Staging jobs are connected-node global, not per bucket. -->
          <Button v-if="stagingJobsEnabled" variant="outline" size="sm" @click="stagingPanelOpen = true">
            <HardDriveDownload class="h-4 w-4" /> Staging
            <Badge v-if="staging.runningCount.value" variant="secondary" size="count" class="ml-1">{{ staging.runningCount.value }}</Badge>
          </Button>
        </template>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <DataViewSkeleton v-if="!bootstrapped" />

      <Notice v-else-if="!s3.connectedEndpoint.value" tone="warning" class="flex items-start gap-3 p-5 text-sm">
        <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This node does not advertise an S3 endpoint, so the portal cannot connect.
          <template v-if="desktop">Turn the local S3 endpoint on under This device, Storage &amp; settings.</template>
        </p>
      </Notice>

      <section v-else-if="!currentUser" class="surface p-6">
        <div class="flex items-start gap-3">
          <LogIn class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h2 class="font-display text-base font-semibold text-aruna-navy">Sign in to browse data</h2>
            <p class="mt-2 text-sm text-muted-foreground">
              The portal then opens a temporary S3 session for your group on {{ requiredNodeName }} and keeps it in memory only.
            </p>
          </div>
        </div>
      </section>

      <section v-else-if="contextError && !contextReady" class="surface p-6">
        <div class="flex items-start gap-3">
          <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <h2 class="font-display text-base font-semibold text-aruna-navy">
              The session for {{ selectedGroupName }} on {{ requiredNodeName }} could not be opened
            </h2>
            <p class="mt-2 text-sm text-destructive">{{ contextError }}</p>
            <Button variant="outline" size="sm" class="mt-3" :disabled="contextBusy" @click="openSelectedContext">
              <KeyRound class="h-4 w-4" /> Retry
            </Button>
          </div>
        </div>
      </section>

      <!-- Never the create-or-join state while memberships are loading. -->
      <section v-else-if="!groupsLoading && !hasGroups" class="surface p-6">
        <div class="flex items-start gap-3">
          <KeyRound class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h2 class="font-display text-base font-semibold text-aruna-navy">Join a group to browse data</h2>
            <p class="mt-2 text-sm text-muted-foreground">
              Buckets belong to a group. The portal opens a temporary S3 session for the selected group on {{ requiredNodeName }} and keeps it in memory only.
            </p>
            <Button variant="outline" size="sm" class="mt-3" as-child>
              <RouterLink :to="{ name: 'groups' }">Create or join a group</RouterLink>
            </Button>
          </div>
        </div>
      </section>

      <!-- Opening the session and loading its data share one placeholder. -->
      <DataViewSkeleton v-else-if="contextBusy || !viewReady" />

      <section v-else class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Notice v-if="sessionWarning" tone="warning" class="lg:col-span-2">
          {{ sessionWarning }}
        </Notice>

        <BucketSidebar :manager="manager" @sync="openSyncFromHit" />

        <ObjectBrowser
          :manager="manager"
          @add-data="addDataOpen = true"
          @new-folder="openNewFolder"
          @sync-to-node="openSyncDialog"
        >
          <UploadPanel :manager="manager" />
        </ObjectBrowser>
      </section>
    </div>

    <AddDataDialog
      v-model:open="addDataOpen"
      :bucket="bucket"
      :prefix="s3Prefix"
      :group-id="activeGroupId"
      :existing-keys="listedKeys"
      :existing-references="references.entries.value"
      @staged="() => { void loadObjects(); void references.reload() }"
      @sync-created="onSyncChanged"
    />

    <StagingJobsPanel v-if="stagingJobsEnabled" v-model:open="stagingPanelOpen" />

    <SyncBucketDialog
      v-model:open="syncDialogOpen"
      :source-bucket="syncSource.bucket"
      :source-prefix="syncSource.prefix"
      :source-node-id="syncSource.nodeId"
      @created="onSyncChanged"
    />

    <FileDetailsDialog
      :open="Boolean(detailsKey)"
      :tab="detailsTab"
      :bucket="bucket"
      :object-key="detailsObject?.key ?? ''"
      :name="detailsObject?.name ?? ''"
      :size="detailsObject?.size"
      :last-modified="detailsObject?.lastModified"
      :node-id="remoteNodeId"
      :group-id="activeGroupId"
      :referenced-from="previewReferencedFrom"
      :probe-reference="previewProbeReference"
      :revision="detailsRevision"
      @update:open="(value: boolean) => { if (!value) closeDetails() }"
      @update:tab="setDetailsTab"
      @delete="requestDelete"
      @changed="detailsRevision += 1"
    />

    <DeleteDialog
      :request="deleteRequest"
      :sync-applies="deleteSyncApplies"
      @close="closeDelete"
      @completed="onDeleted"
    />

    <Dialog :open="newFolderOpen" @update:open="(v: boolean) => (newFolderOpen = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Creates <span class="font-mono text-xs">{{ s3Prefix }}{{ newFolderName.trim() || 'name' }}/</span> in
            <span class="font-mono text-xs">{{ bucket }}</span>.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Input
            v-model="newFolderName"
            placeholder="folder-name"
            class="font-mono text-xs"
            :invalid="newFolderName.trim() && newFolderProblem ? 'error' : undefined"
            @keyup.enter="createFolder"
          />
          <p v-if="newFolderName.trim() && newFolderProblem" class="text-xs text-destructive">{{ newFolderProblem }}</p>
          <p
            v-else-if="newFolderName.trim() && !s3.canWrite(bucket, `${s3Prefix}${newFolderName.trim()}/`, remoteNodeId)"
            class="text-xs text-muted-foreground"
          >
            This session does not allow creating a folder here.
          </p>
          <Notice v-if="newFolderError" tone="error">{{ newFolderError }}</Notice>
        </div>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="newFolderInvalid || newFolderBusy || !s3.canWrite(bucket, `${s3Prefix}${newFolderName.trim()}/`, remoteNodeId)" @click="createFolder">{{ newFolderBusy ? 'Creating…' : 'Create' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
