<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import StagingJobsPanel from '@/components/data/StagingJobsPanel.vue'
import SyncBucketDialog from '@/components/data/SyncBucketDialog.vue'
import SyncStatusPanel from '@/components/data/SyncStatusPanel.vue'
import BucketSidebar from '@/components/data/manager/BucketSidebar.vue'
import DeletionFlow from '@/components/data/manager/DeletionFlow.vue'
import ObjectBrowser from '@/components/data/manager/ObjectBrowser.vue'
import UploadPanel from '@/components/data/manager/UploadPanel.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import { useAruna } from '@/composables/useAruna'
import { useDataManager } from '@/composables/useDataManager'
import { useStaging } from '@/composables/useStaging'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
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
  selectedGroupLabel,
  groupsLoading,
  contextBusy,
  contextError,
  contextReady,
  contextMismatch,
  requiredNodeId,
  requiredNodeName,
  issuerNodeName,
  sessionWarning,
  groupOptions,
  keyTail,
  openSelectedContext,
  activeGroupId,
  canWriteCurrentPrefix,
  listedKeys,
  references,
  loadObjects,
  loadSyncOverview,
  bucketList,
  previewOpen,
  previewObject,
  previewReferencedFrom,
  previewProbeReference,
  refreshSpinning,
  onRefresh,
} = manager

const deletion = ref<InstanceType<typeof DeletionFlow> | null>(null)

// ── Bucket sync ─────────────────────────────────────────────────────────────
const syncDialogOpen = ref(false)
const syncSource = ref<{ bucket: string; prefix: string; nodeId: string | null }>({
  bucket: '',
  prefix: '',
  nodeId: null,
})
const syncPanelOpen = ref(false)

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

// "New sync" inside the status panel: swap the centered dialogs instead of
// stacking them.
function onNewSyncRequested() {
  syncPanelOpen.value = false
  openSyncDialog()
}

const addDataOpen = ref(false)
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
const newFolderInvalid = computed(() => {
  const name = newFolderName.value.trim()
  return !name || name.includes('/')
})

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
          <span class="hidden text-xs text-muted-foreground xl:inline" :title="requiredNodeId ?? undefined">
            Node: {{ requiredNodeName }}
          </span>
          <Select
            v-model="selectedGroupId"
            :options="groupOptions"
            placeholder="Select a group"
            aria-label="S3 session group"
            class="w-52"
          />
          <Button
            variant="outline"
            size="sm"
            :disabled="!selectedGroupId || !requiredNodeId || contextBusy || contextReady"
            @click="openSelectedContext"
          >
            <Spinner v-if="contextBusy" label="Opening the session" class="text-current" />
            <KeyRound v-else class="h-4 w-4" />
            {{ contextReady ? 'Session active' : contextMismatch || remoteNodeId ? 'Open on this node' : 'Open group' }}
          </Button>
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
            <Badge v-if="staging.runningCount.value" variant="secondary" class="ml-1">{{ staging.runningCount.value }}</Badge>
          </Button>
        </template>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section v-if="!s3.connectedEndpoint.value && !bootstrapped" class="surface p-5">
        <Spinner show-label label="Connecting to the node…" class="text-sm" />
      </section>

      <Notice v-else-if="!s3.connectedEndpoint.value" tone="warning" class="flex items-start gap-3 p-5 text-sm">
        <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This node does not advertise an S3 endpoint, so the portal cannot connect.
          <template v-if="desktop">Turn the local S3 endpoint on under This device, Storage &amp; settings.</template>
        </p>
      </Notice>

      <section v-else-if="!contextReady" class="surface p-6">
        <div class="flex items-start gap-3">
          <KeyRound class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h2 class="font-display text-base font-semibold text-aruna-navy">Open a temporary S3 session</h2>
            <p v-if="!currentUser" class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <LogIn class="h-4 w-4" /> Sign in, then explicitly select a node and group.
            </p>
            <p v-else-if="contextMismatch" class="mt-2 text-sm text-muted-foreground">
              The current session was issued by {{ issuerNodeName }} ({{ contextMismatch.issuerNodeId }}). This bucket requires {{ requiredNodeName }} ({{ contextMismatch.requiredNodeId }}). Select the group and choose Open on this node. The existing credential will not be sent to the required node.
            </p>
            <!-- Never the create-or-join state while memberships are loading. -->
            <Spinner
              v-else-if="groupsLoading"
              show-label
              label="Loading your groups…"
              class="mt-2 text-sm"
            />
            <template v-else-if="!selectedGroupId">
              <p class="mt-2 text-sm text-muted-foreground">
                Select a group above. The portal mints a node-local session only after that explicit selection and keeps it in memory only.
              </p>
              <Button variant="outline" size="sm" class="mt-3" as-child>
                <RouterLink :to="{ name: 'groups' }">Create or join a group</RouterLink>
              </Button>
            </template>
            <p v-else class="mt-2 text-sm text-muted-foreground">
              Open group {{ selectedGroupLabel || selectedGroupId }} on {{ requiredNodeName }}. Expired sessions block new operations and are replaced only after this explicit action.
            </p>
            <p v-if="contextError" class="mt-3 text-xs text-destructive">{{ contextError }}</p>
          </div>
        </div>
      </section>

      <section v-else class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Notice v-if="sessionWarning" tone="warning" class="lg:col-span-2">
          {{ sessionWarning }}
        </Notice>

        <BucketSidebar
          :manager="manager"
          @sync="openSyncFromHit"
          @delete-bucket="(name: string, nodeId: string | null) => deletion?.openDeleteBucket(name, nodeId)"
        />

        <ObjectBrowser
          :manager="manager"
          @add-data="addDataOpen = true"
          @new-folder="openNewFolder"
          @syncs="syncPanelOpen = true"
          @sync-to-node="openSyncDialog"
          @bulk-delete="deletion?.openBulkDelete()"
          @delete-bucket="(name: string, nodeId: string | null) => deletion?.openDeleteBucket(name, nodeId)"
          @delete-object="(object) => deletion?.openDeleteObject(object)"
          @delete-folder="(folder) => deletion?.openDeleteFolder(folder)"
          @purge-object="(object) => deletion?.openPermanentDeleteObject(object)"
          @purge-folder="(folder) => deletion?.openPermanentDeleteFolder(folder)"
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

    <SyncStatusPanel
      v-model:open="syncPanelOpen"
      :bucket="bucket"
      :node-id="remoteNodeId"
      @changed="onSyncChanged"
      @new-sync="onNewSyncRequested"
    />

    <PreviewPane
      v-model:open="previewOpen"
      :bucket="bucket"
      :object-key="previewObject?.key ?? ''"
      :name="previewObject?.name ?? ''"
      :size="previewObject?.size"
      :node-id="remoteNodeId"
      :referenced-from="previewReferencedFrom"
      :probe-reference="previewProbeReference"
    />

    <DeletionFlow ref="deletion" :manager="manager" />

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
          <Input v-model="newFolderName" placeholder="folder-name" class="font-mono text-xs" @keyup.enter="createFolder" />
          <p v-if="newFolderName.trim().includes('/')" class="text-xs text-destructive">The folder name cannot contain '/'.</p>
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
