<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
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
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import NewBucketDialog from '@/components/desktop/NewBucketDialog.vue'
import BucketSidebar from '@/components/data/manager/BucketSidebar.vue'
import NodePicker from '@/components/data/NodePicker.vue'
import DeleteDialog from '@/components/data/DeleteDialog.vue'
import FileDetailsDialog from '@/components/data/FileDetailsDialog.vue'
import PublicAccessDialog from '@/components/data/PublicAccessDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MockSidebar from '@/components/data/manager/MockSidebar.vue'
import DatabaseHeader from '@/components/data/DatabaseHeader.vue'
import DistributionBanner from '@/components/data/manager/DistributionBanner.vue'
import ObjectBrowser from '@/components/data/manager/ObjectBrowser.vue'
import UploadPanel from '@/components/data/manager/UploadPanel.vue'
import NewNotebookDialog from '@/components/notebook/NewNotebookDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useDataManager } from '@/composables/useDataManager'
import { useBucketDistribution } from '@/composables/useBucketDistribution'
import { providePageContext } from '@/composables/usePageContext'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { folderNameProblem } from '@/lib/bucketName'
import { isDesktop } from '@/lib/desktop'
import { mockEnabled } from '@/lib/distributedMock'
import { mockBucket } from '@/lib/distributedMockData'
import type { BindSource } from '@/lib/bindSource'
import { placeName, placeTitle } from '@/lib/bucketPlace'
import type { PublicTarget } from '@/lib/publicAccess'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { KeyRound, LogIn, ShieldAlert } from '@lucide/vue'

const { bootstrapped, currentUser, myGroups } = useAruna()
const s3 = useS3()
const desktop = isDesktop()

const manager = useDataManager()
const {
  route,
  router,
  bucket,
  s3Prefix,
  remoteNodeId,
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
  bucketNodeChoice,
  recentNodes,
  pickNode,
  activeGroupId,
  publicAccess,
  syncsForKey,
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
  details: {
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

// ── Public access ───────────────────────────────────────────────────────────
const publicOpen = ref(false)
const publicTargets = ref<PublicTarget[]>([])

function openPublicAccess(targets: PublicTarget[]) {
  publicTargets.value = targets
  publicOpen.value = true
}

// ── Bucket sync ─────────────────────────────────────────────────────────────
// "Link a local folder": the desktop binds a bucket to a folder. The source
// always comes with explicit node and group ids; newBucket is made by the link.
const bindOpen = ref(false)
const bindTarget = ref<BindSource & { newBucket?: boolean }>({ bucket: '', nodeId: '', groupId: '' })

function openBindDialog(source: BindSource & { newBucket?: boolean }) {
  bindTarget.value = source
  bindOpen.value = true
}

// New bucket in the desktop: it opens once made, or goes on to the link dialog.
const newBucketOpen = ref(false)
watch(newBucketOpen, (open) => {
  contextHold.value = open
})

function onBucketCreated(created: BindSource) {
  manager.openSearchHit({
    arn: '',
    bucket: created.bucket,
    node_id: created.nodeId,
    group_id: created.groupId,
    group_name: myGroups.value.find((group) => group.id === created.groupId)?.name ?? null,
    created_at: '',
  })
  refreshShownBuckets()
}

// The list shown: every node through the search, or the one node, which also
// stands in when an older node cannot list without a name.
function refreshShownBuckets() {
  const search = bucketNodeChoice.value === null && !manager.allBuckets.needsName.value
  void (search ? manager.allBuckets.reload() : bucketList.refresh())
}

// The desktop names the place; kind and id go to the tooltip.
const headerPlace = computed(() => {
  const node = desktop ? realmNodes.nodeById(requiredNodeId.value) : null
  return node
    ? { name: placeName(node), title: placeTitle(node) }
    : { name: requiredNodeName.value, title: `${requiredNodeName.value} (${requiredNodeId.value})` }
})

function onSyncChanged() {
  refreshShownBuckets()
  void loadSyncOverview()
}

const addDataOpen = ref(false)
// An example bucket of the node mock replaces the object browser.
const exampleBucket = computed(() => (mockEnabled() ? mockBucket(bucket.value) : undefined))
// A bucket of this node that is stored on more nodes shows its state above the files.
const distribution = useBucketDistribution(bucket, remoteNodeId)
const storedBucket = computed(() => exampleBucket.value ?? distribution.view.value ?? undefined)
// Without a session the example buckets still show, from static data.
const mockOnly = computed(
  () =>
    mockEnabled() &&
    bootstrapped.value &&
    (!currentUser.value ||
      !s3.connectedEndpoint.value ||
      Boolean(contextError.value && !contextReady.value) ||
      (!groupsLoading.value && !hasGroups.value)),
)
const newNotebookOpen = ref(false)
// The notebooks entry is this same view with notebooks highlighted.
const notebooksView = computed(() => route.name === 'notebooks' || route.query.notebooks === '1')
const headerTitle = computed(() => (notebooksView.value ? 'Notebooks' : route.name === 'bucket' ? bucket.value : 'Data'))
const headerDescription = computed(() =>
  notebooksView.value
    ? 'Pick a notebook to open, or create one in the folder you are browsing.'
    : `Browse buckets and objects through the node's S3 interface, signed in your browser.`,
)
// The Add data browser may open another node or group; the view takes its
// own session back once the dialog closes.
watch(addDataOpen, (open) => {
  contextHold.value = open
})

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
  if (exampleBucket.value) {
    newFolderOpen.value = false
    return
  }
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
      :title="headerTitle"
      :description="headerDescription"
      :docs="{ topic: 'upload-data', section: 'Create a bucket and upload' }"
    >
      <template #title>
        <span class="flex min-w-0 items-baseline gap-2">
          <span class="truncate" :title="headerTitle">{{ headerTitle }}</span>
          <span
            v-if="route.name === 'bucket' && !notebooksView && requiredNodeId"
            class="min-w-0 truncate text-sm font-normal text-muted-foreground"
            :title="headerPlace.title"
          >
            on {{ headerPlace.name }}
          </span>
        </span>
      </template>
      <template #description>
        {{ headerDescription }}
        <span
          v-if="currentUser && s3.connectedEndpoint.value"
          class="mt-2 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
        >
          <!-- The group is the top bar's context; here it only stays visible. -->
          <span class="hidden lg:inline">Showing buckets of</span>
          <RouterLink
            v-if="selectedGroupId"
            :to="{ name: 'group', params: { id: selectedGroupId } }"
            class="max-w-[12rem] truncate font-medium text-foreground hover:underline"
            :title="`${selectedGroupName} (${selectedGroupId}) · Switch the group in the top bar`"
          >
            {{ selectedGroupName }}
          </RouterLink>
          <span v-else class="text-muted-foreground">No group</span>
          <span class="hidden lg:inline">on</span>
          <NodePicker :model-value="bucketNodeChoice" :recent="recentNodes" @update:model-value="pickNode" />
          <span
            v-if="contextReady"
            class="flex shrink-0 items-center gap-1 font-mono text-[11px]"
            :title="`Temporary session ${s3.activeKey.value?.accessKeyId} for group ${activeGroupId} on node ${requiredNodeId}`"
          >
            <KeyRound class="h-3 w-3" /> …{{ keyTail }}
          </span>
        </span>
      </template>
      <template #actions>
        <RefreshButton v-if="contextReady" :busy="refreshSpinning" @click="onRefresh" />
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <DataViewSkeleton v-if="!bootstrapped" />

      <section v-else-if="mockOnly" class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <MockSidebar :active="bucket" @open="(name: string) => manager.openBucket(name)" />
        <div v-if="exampleBucket" class="min-w-0 space-y-4">
          <DistributionBanner :bucket="exampleBucket" />
          <ObjectBrowser
            :manager="manager"
            :notebooks="notebooksView"
            @add-data="addDataOpen = true"
            @new-folder="openNewFolder"
            @new-notebook="newNotebookOpen = true"
            @sync-to-computer="openBindDialog"
            @public-access="openPublicAccess"
          />
        </div>
        <EmptyState v-else title="Pick an example bucket" description="The buckets on the left show example data. Nothing here talks to a node." />
      </section>

      <Notice v-else-if="!s3.connectedEndpoint.value" tone="warning" class="flex items-start gap-3 p-5 text-sm">
        <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This node does not advertise an S3 endpoint, so the portal cannot connect.
          <template v-if="desktop">Turn the local S3 endpoint on under This computer.</template>
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
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" :disabled="contextBusy" @click="openSelectedContext">
                <KeyRound class="h-4 w-4" /> Retry
              </Button>
              <span class="text-xs text-muted-foreground">Node</span>
              <NodePicker :model-value="bucketNodeChoice" :recent="recentNodes" @update:model-value="pickNode" />
            </div>
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

      <!-- The desktop's bucket rows carry a node and a link column, so its list is wider. -->
      <section v-else class="grid gap-6" :class="desktop ? 'lg:grid-cols-[300px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)]'">
        <Notice v-if="sessionWarning" tone="warning" class="lg:col-span-2">
          {{ sessionWarning }}
        </Notice>

        <BucketSidebar
          :manager="manager"
          @sync-computer="openBindDialog"
          @new-bucket="newBucketOpen = true"
        />

        <div class="min-w-0 space-y-4">
          <DistributionBanner v-if="storedBucket" :bucket="storedBucket" />
          <DatabaseHeader v-if="bucket && !exampleBucket" :bucket="bucket" :node-id="remoteNodeId" />
          <ObjectBrowser
            :manager="manager"
            :notebooks="notebooksView"
            @add-data="addDataOpen = true"
            @new-folder="openNewFolder"
            @new-notebook="newNotebookOpen = true"
            @sync-to-computer="openBindDialog"
            @public-access="openPublicAccess"
            @new-bucket="newBucketOpen = true"
          >
            <UploadPanel :manager="manager" />
          </ObjectBrowser>
        </div>
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

    <NewNotebookDialog
      v-model:open="newNotebookOpen"
      :bucket="bucket"
      :prefix="s3Prefix"
      :group-id="activeGroupId ?? ''"
    />

    <BindFolderDialog
      v-if="desktop"
      v-model:open="bindOpen"
      :bucket="bindTarget.bucket"
      :node-id="bindTarget.nodeId"
      :group-id="bindTarget.groupId"
      :new-bucket="bindTarget.newBucket"
      @bound="onSyncChanged"
    />

    <NewBucketDialog
      v-if="desktop"
      v-model:open="newBucketOpen"
      :group-id="selectedGroupId"
      @created="onBucketCreated"
      @link="(target: BindSource) => openBindDialog({ ...target, newBucket: true })"
    />

    <PublicAccessDialog
      v-model:open="publicOpen"
      :access="publicAccess"
      :node-id="remoteNodeId"
      :targets="publicTargets"
    />

    <FileDetailsDialog
      :open="Boolean(detailsKey)"
      :tab="detailsTab"
      :bucket="bucket"
      :object-key="detailsObject?.key ?? ''"
      :name="detailsObject?.name ?? ''"
      :folder="detailsKey.endsWith('/')"
      :access="publicAccess"
      :syncs="detailsKey ? syncsForKey(detailsKey) : []"
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

    <!-- Mounted after the details dialog, so a delete asked for inside it opens
         on top and the file stays open behind it. -->
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
