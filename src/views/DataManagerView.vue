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
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import DataViewSkeleton from '@/components/data/DataViewSkeleton.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import NewBucketDialog from '@/components/desktop/NewBucketDialog.vue'
import CreateBucketDialog from '@/components/data/CreateBucketDialog.vue'
import BucketSidebar from '@/components/data/manager/BucketSidebar.vue'
import BucketChooser from '@/components/data/manager/BucketChooser.vue'
import NodePicker from '@/components/data/NodePicker.vue'
import DeleteDialog from '@/components/data/DeleteDialog.vue'
import FileDetailsDialog from '@/components/data/FileDetailsDialog.vue'
import PublicAccessDialog from '@/components/data/PublicAccessDialog.vue'
import ShareLinkDialog from '@/components/data/ShareLinkDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MockSidebar from '@/components/data/manager/MockSidebar.vue'
import DistributionBanner from '@/components/data/manager/DistributionBanner.vue'
import ObjectBrowser from '@/components/data/manager/ObjectBrowser.vue'
import UploadPanel from '@/components/data/manager/UploadPanel.vue'
import VisitorData from '@/components/data/VisitorData.vue'
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
import { useElementSize } from '@vueuse/core'
import { RouterLink } from 'vue-router'
import type { ObjectSearchHit, ShareTarget } from '@/lib/api'
import { ArrowLeft, ChevronDown, KeyRound, Server, ShieldAlert } from '@lucide/vue'

const { bootstrapped, currentUser, myGroups } = useAruna()
const s3 = useS3()
const desktop = isDesktop()

const manager = useDataManager()
const {
  route,
  router,
  bucket,
  bucketMissing,
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

// The content width sets the layout, as the app's sidebar takes its part of the window. Below
// 960 px the title picks the bucket and the list opens in a sheet; below 600 px it is a phone.
const root = ref<HTMLElement | null>(null)
const { width: viewWidth } = useElementSize(root)
const narrow = computed(() => viewWidth.value > 0 && viewWidth.value < 960)
// Once shown, the view stays while a bucket on another node opens; a new group or user starts over.
const viewKept = ref(false)
watch(viewReady, (ready) => ready && (viewKept.value = true), { immediate: true })
watch([selectedGroupId, () => currentUser.value?.id], () => (viewKept.value = false))
const phone = computed(() => viewWidth.value > 0 && viewWidth.value < 600)
const pickerOpen = ref(false)
watch(narrow, (value) => {
  if (!value) pickerOpen.value = false
})
watch([bucket, remoteNodeId], () => (pickerOpen.value = false))
function newBucketFromPicker() {
  pickerOpen.value = false
  newBucketOpen.value = true
}

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

// ── Share links ─────────────────────────────────────────────────────────────
const shareOpen = ref(false)
const shareTarget = ref<ShareTarget | null>(null)
const shareName = computed(() => {
  const target = shareTarget.value
  if (!target || target.kind === 'dataset') return ''
  const path = target.kind === 'bucket' ? target.bucket : target.kind === 'folder' ? target.prefix : target.key
  return path.replace(/\/$/, '').split('/').at(-1) ?? path
})

function openShareLink(target: ShareTarget) {
  shareTarget.value = target
  shareOpen.value = true
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

// New bucket: it opens once made; in the desktop it may go on to the link dialog.
const newBucketOpen = ref(false)
watch(newBucketOpen, (open) => {
  contextHold.value = open
})
// The top bar's Create menu opens the dialog with ?create=bucket; the marker goes once read.
watch(
  () => route.query.create,
  (create) => {
    if (create !== 'bucket') return
    newBucketOpen.value = true
    const { create: _create, ...rest } = route.query
    void router.replace({ query: rest })
  },
  { immediate: true },
)

// A found folder opens itself; a found file opens the folder that holds it, on the hit's node.
// A folder hit opens the folder; a file hit opens its folder with the file's details.
function openFound(hit: ObjectSearchHit) {
  const isFolder = hit.key.endsWith('/')
  const folder = isFolder ? hit.key.slice(0, -1) : hit.key.split('/').slice(0, -1).join('/')
  const here = remoteNodeId.value ? hit.issuer_node_id === remoteNodeId.value : realmNodes.isLocalNode(hit.issuer_node_id)
  if (here && isFolder) return manager.navigateTo(folder)
  const node = here ? remoteNodeId.value : realmNodes.isLocalNode(hit.issuer_node_id) ? null : hit.issuer_node_id
  void router.push({
    name: 'bucket',
    params: { bucketId: hit.bucket },
    query: { ...(folder ? { prefix: folder } : {}), ...(node ? { node } : {}), group: hit.group_id, ...(isFolder ? {} : { object: hit.key }) },
  })
}

// A referenced bucket goes on to the list import of its source address, once the bucket is open.
const addDataTab = ref<string | undefined>(undefined)
const addDataLink = ref<string | undefined>(undefined)
const pendingImport = ref<{ bucket: string; nodeId: string | null; source: string } | null>(null)
watch([bucket, remoteNodeId, contextReady, pendingImport], () => {
  const pending = pendingImport.value
  if (!pending || bucket.value !== pending.bucket || remoteNodeId.value !== pending.nodeId || !contextReady.value) return
  pendingImport.value = null
  addDataTab.value = 'list'
  addDataLink.value = pending.source
  addDataOpen.value = true
})
function onBucketCreated(created: BindSource, source?: string) {
  const nodeId = realmNodes.isLocalNode(created.nodeId) ? null : created.nodeId
  pendingImport.value = source ? { bucket: created.bucket, nodeId, source } : null
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
// The realm bucket list names a bucket stored on one node; its node is then not asked.
const knownOrdinary = computed(() => manager.allBuckets.hits.value.some((hit) =>
  hit.bucket === bucket.value && !hit.set_id
  && (remoteNodeId.value ? hit.node_id === remoteNodeId.value : realmNodes.isLocalNode(hit.node_id))))
const distribution = useBucketDistribution(bucket, remoteNodeId, knownOrdinary)
const storedBucket = computed(() => exampleBucket.value ?? distribution.view.value ?? undefined)
const spreadNodes = computed(() => storedBucket.value?.members.map((member) => member.nodeId) ?? [])
// The nodes named next to the bucket name: every node of a spread bucket, else its one node.
const headerNodes = computed(() => (spreadNodes.value.length > 1 ? spreadNodes.value : requiredNodeId.value ? [requiredNodeId.value] : []))
const NODE_CHIP = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border-subtle px-2 py-0.5 font-sans text-xs font-normal tracking-normal text-muted-foreground hover:border-primary/40 hover:text-foreground'
const bucketSetId = computed(() => distribution.view.value?.live?.setId ?? (distribution.state.value === 'ordinary' ? null : undefined))
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
// The picker stands in for the list wherever the list itself would show.
const listReachable = computed(() => Boolean(currentUser.value && s3.connectedEndpoint.value) && !mockOnly.value)
const newNotebookOpen = ref(false)
// The notebooks entry is this same view with notebooks highlighted.
const notebooksView = computed(() => route.name === 'notebooks' || route.query.notebooks === '1')
const headerTitle = computed(() => (notebooksView.value ? 'Notebooks' : route.name === 'bucket' ? bucket.value : 'Data'))
const headerDescription = computed(() =>
  notebooksView.value
    ? 'Pick a notebook to open, or create one in the folder you are browsing.'
    : '',
)
// The Add data browser may open another node or group; the view takes its
// own session back once the dialog closes.
watch(addDataOpen, (open) => {
  contextHold.value = open
  if (!open) addDataTab.value = addDataLink.value = undefined
})

// Upload files asks for a bucket first: the dialog opens once one is open and ready.
const uploadPending = ref(false)
watch([bucket, contextReady, uploadPending], () => {
  if (!uploadPending.value || !bucket.value || !contextReady.value) return
  uploadPending.value = false
  addDataOpen.value = true
})
// The retired bucket-builder route redirects here with ?addData=1 so old links
// land in the consolidated dialog; strip the marker once consumed.
watch(
  () => route.query.addData,
  (flag) => {
    if (flag === undefined) return
    if (flag === '1') uploadPending.value = true
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
  <!-- The content width, not the window, sets the layout: the app's sidebar takes its part. -->
  <div ref="root" class="@container">
    <PageHeader
      :title="headerTitle"
      :description="headerDescription"
      :crumbs="route.name === 'bucket' && !notebooksView && bucket ? [{ label: bucket }] : []"
      :docs="{ topic: 'upload-data', section: 'Create a bucket and upload' }"
    >
      <template #title>
        <!-- A narrow screen puts the node below the name instead of cutting the name short. -->
        <span class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <button
            v-if="narrow && listReachable && bucket"
            type="button"
            class="inline-flex max-w-full items-center gap-1.5 hover:text-primary"
            aria-haspopup="dialog"
            :aria-label="`${headerTitle}, switch bucket`"
            @click="pickerOpen = true"
          >
            <span class="truncate">{{ headerTitle }}</span>
            <ChevronDown class="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          <span v-else class="max-w-full truncate" :title="headerTitle">{{ headerTitle }}</span>
          <!-- Up to two nodes by name; more collapse into one menu so the header stays short. -->
          <span v-if="route.name === 'bucket' && !notebooksView && headerNodes.length" class="inline-flex flex-wrap items-center gap-1.5" aria-label="Stored on">
            <template v-if="headerNodes.length <= 2">
              <RouterLink
                v-for="id in headerNodes"
                :key="id"
                :to="{ name: 'node', params: { nodeId: id } }"
                :class="NODE_CHIP"
                :title="headerNodes.length === 1 ? headerPlace.title : `Open ${realmNodes.displayName(id)}`"
              >{{ headerNodes.length === 1 ? headerPlace.name : realmNodes.displayName(id) }}</RouterLink>
            </template>
            <DropdownMenu v-else>
              <DropdownMenuTrigger as-child>
                <button type="button" :class="NODE_CHIP">{{ headerNodes.length }}&nbsp;nodes <ChevronDown class="h-3 w-3" aria-hidden="true" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-56">
                <DropdownMenuLabel>Stored on {{ headerNodes.length }}&nbsp;nodes</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem v-for="id in headerNodes" :key="id" as-child>
                  <RouterLink :to="{ name: 'node', params: { nodeId: id } }"><Server class="h-3.5 w-3.5" /> {{ realmNodes.displayName(id) }}</RouterLink>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </span>
      </template>
      <template #description>{{ headerDescription }}</template>
      <template #actions>
        <RefreshButton v-if="contextReady" :busy="refreshSpinning" :sr-label="phone ? 'Refresh' : undefined" @click="onRefresh" />
      </template>
    </PageHeader>

    <div class="w-full px-4 sm:px-6 space-y-6 py-8">
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

      <VisitorData v-else-if="!currentUser">
        <template #header>
          <DistributionBanner v-if="storedBucket" :bucket="storedBucket" />
        </template>
      </VisitorData>

      <Notice v-else-if="!s3.connectedEndpoint.value" tone="warning" class="flex items-start gap-3 p-5 text-sm">
        <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This node does not advertise an S3 endpoint, so the portal cannot connect.
          <template v-if="desktop">Turn the local S3 endpoint on under This computer.</template>
        </p>
      </Notice>

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
      <DataViewSkeleton v-else-if="(contextBusy || !viewReady) && !viewKept" />

      <section v-else class="grid gap-x-6 gap-y-8" :class="narrow ? '' : 'grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]'">
        <Notice v-if="sessionWarning" tone="warning" :class="narrow ? '' : 'col-span-2'">
          {{ sessionWarning }}
        </Notice>
        <Notice v-if="uploadPending && !bucket" :class="narrow ? '' : 'col-span-2'">
          Choose a bucket to upload files to.
        </Notice>

        <!-- A narrow view without an open bucket shows the list itself instead of the title picker. -->
        <BucketSidebar
          v-if="!narrow || !bucket"
          :manager="manager"
          @sync-computer="openBindDialog"
          @new-bucket="newBucketOpen = true"
        />

        <BucketChooser v-if="!bucket && !narrow" />
        <DataViewSkeleton v-else-if="bucket && (contextBusy || !viewReady)" files />
        <EmptyState
          v-else-if="bucket && bucketMissing"
          title="This bucket was deleted"
          description="It no longer exists, or the link is wrong."
        >
          <Button variant="outline" as-child>
            <RouterLink :to="{ name: 'buckets', query: selectedGroupId ? { group: selectedGroupId } : {} }">
              <ArrowLeft class="h-4 w-4" /> All buckets
            </RouterLink>
          </Button>
        </EmptyState>
        <ObjectBrowser
          v-else-if="bucket"
          :manager="manager"
          :set-id="exampleBucket ? null : bucketSetId"
          :notebooks="notebooksView"
          @add-data="addDataOpen = true"
          @new-folder="openNewFolder"
          @new-notebook="newNotebookOpen = true"
          @sync-to-computer="openBindDialog"
          @public-access="openPublicAccess"
          @share-link="openShareLink"
          @new-bucket="newBucketOpen = true"
          @open-hit="openFound"
        >
          <template #header>
            <DistributionBanner v-if="storedBucket" :bucket="storedBucket" />
          </template>
          <UploadPanel :manager="manager" />
        </ObjectBrowser>
      </section>
    </div>

    <Sheet :open="pickerOpen" @update:open="(value: boolean) => (pickerOpen = value)">
      <SheetContent side="bottom" class="max-h-[85dvh] rounded-t-2xl p-0">
        <DialogDescription class="sr-only">Pick a bucket to open, or create one.</DialogDescription>
        <BucketSidebar sheet :manager="manager" @sync-computer="openBindDialog" @new-bucket="newBucketFromPicker" />
      </SheetContent>
    </Sheet>

    <AddDataDialog
      v-model:open="addDataOpen"
      :tab="addDataTab"
      :link="addDataLink"
      :bucket="bucket"
      :node-id="remoteNodeId"
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
      :node-id="remoteNodeId"
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
    <CreateBucketDialog
      v-else
      v-model:open="newBucketOpen"
      :group-id="selectedGroupId"
      :node-id="requiredNodeId"
      @created="onBucketCreated"
    />

    <PublicAccessDialog
      v-model:open="publicOpen"
      :access="publicAccess"
      :node-id="remoteNodeId"
      :targets="publicTargets"
    />

    <ShareLinkDialog v-model:open="shareOpen" :target="shareTarget" :node-id="remoteNodeId" :name="shareName" />

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
