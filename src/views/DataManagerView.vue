<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
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
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import Popover from '@/components/ui/Popover.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import StagingJobsPanel from '@/components/data/StagingJobsPanel.vue'
import SyncBucketDialog from '@/components/data/SyncBucketDialog.vue'
import SyncStatusPanel from '@/components/data/SyncStatusPanel.vue'
import BucketRoutingDialog from '@/components/data/BucketRoutingDialog.vue'
import BucketPolicyDialog from '@/components/residency/BucketPolicyDialog.vue'
import ObjectLocationsDialog from '@/components/data/ObjectLocationsDialog.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import { useAruna } from '@/composables/useAruna'
import { useBuckets } from '@/composables/useBuckets'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useStaging } from '@/composables/useStaging'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { useUploadQueue } from '@/composables/useUploadQueue'
import { featureEnabled } from '@/lib/config'
import { useS3, s3ErrorMessage, isS3AuthError, isS3NetworkError, isS3BucketNotEmptyError, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { assessQuota, quotaCountedBytes, type QuotaAssessment } from '@/lib/quota'
import { isWorkspaceBucket } from '@/lib/workspaces'
import type { BucketSearchHit, SourceConnectorSummary, UsageResponse } from '@/lib/api'
import { referenceSourceLabel, referenceSourceName, type ReferenceSourceGroup } from '@/lib/references'
import { parseArunaArn, prefixesOverlap, syncBucketKey } from '@/lib/sync'
import { formatBytes, relativeTime } from '@/lib/utils'
import { dataWatchPathPrefix, s3EndpointNodeId } from '@/lib/watches'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftRight,
  Boxes,
  ChevronRight,
  CloudOff,
  Download,
  Eye,
  FolderPlus,
  HardDrive,
  HardDriveDownload,
  History,
  KeyRound,
  Link2,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { authToken, currentUser, bootstrapped, myGroups, getGroupUsage, isManagementNode, isRealmAdmin, listGroupConnectors, listSyncRelationships, nodeInfo, realmInfo } = useAruna()
const s3 = useS3()

function routeString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

const bucket = computed(() => routeString(route.params.bucketId))
const prefix = computed(() => routeString(route.query.prefix))
const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))

// Federated bucket search + cross-node browsing. The optional ?node=<id> route
// param selects the hosting node (default: the connected node) so deep links
// into remote buckets stay stable. Each node and group uses its own temporary
// session, selected explicitly before any request is sent.
const realmNodes = useRealmNodes()
const shortcuts = useBucketShortcuts()

const remoteNodeId = computed(() => {
  const nodeId = routeString(route.query.node)
  if (!nodeId || realmNodes.isLocalNode(nodeId)) return null
  return nodeId
})
const selectedGroupId = ref(routeString(route.query.group) || s3.activeContext.value?.groupId || '')
const selectedGroupLabel = ref('')
const contextBusy = ref(false)
const contextError = ref<string | null>(null)
const requiredNodeId = computed(() => s3.nodeIdFor(remoteNodeId.value))
const contextMismatch = computed(() => s3.contextMismatch(remoteNodeId.value))
const contextReady = computed(() => {
  const context = s3.activeContext.value
  return Boolean(
    context &&
      s3.activeKey.value &&
      currentUser.value &&
      context.userId === currentUser.value.id &&
      context.nodeId === requiredNodeId.value &&
      context.groupId === selectedGroupId.value,
  )
})
const contextFingerprint = computed(() => {
  const context = contextReady.value ? s3.activeContext.value : null
  return context ? `${context.nodeId}|${context.groupId}|${context.session.accessKeyId}` : ''
})
const sessionWarning = computed(() =>
  contextReady.value ? s3.activeContext.value?.session.warning ?? null : null,
)
const groupOptions = computed(() => {
  const options = myGroups.value.map((group) => ({ value: group.id, label: group.name }))
  if (selectedGroupId.value && !options.some((option) => option.value === selectedGroupId.value)) {
    options.push({
      value: selectedGroupId.value,
      label: selectedGroupLabel.value || selectedGroupId.value,
    })
  }
  return options
})
const requiredNodeName = computed(() =>
  requiredNodeId.value ? realmNodes.displayName(requiredNodeId.value) : 'the selected node',
)
const issuerNodeName = computed(() =>
  contextMismatch.value ? realmNodes.displayName(contextMismatch.value.issuerNodeId) : '',
)

watch(selectedGroupId, () => {
  contextError.value = null
  uploadRestrictionError.value = null
})

async function openSelectedContext() {
  if (!selectedGroupId.value || !requiredNodeId.value || contextBusy.value) return
  contextBusy.value = true
  contextError.value = null
  try {
    await s3.activateContext(remoteNodeId.value, selectedGroupId.value)
    await router.replace({
      query: {
        ...route.query,
        group: selectedGroupId.value,
      },
    })
  } catch (err) {
    contextError.value = s3ErrorMessage(err)
  } finally {
    contextBusy.value = false
  }
}
// The endpoint actually serving the browsed bucket (local or remote).
const effectiveEndpoint = computed(() => s3.endpointForNode(remoteNodeId.value))
// Remote node without a published S3 endpoint: honest info panel, never a
// broken view. CORS/unreachable failures flip remoteBrowseBlocked instead.
const remoteEndpointMissing = computed(() => Boolean(remoteNodeId.value) && !effectiveEndpoint.value)
const remoteBrowseBlocked = ref(false)
const remoteBlocked = computed(() => remoteEndpointMissing.value || remoteBrowseBlocked.value)

// Per-bucket storage rules; local buckets only, like the bucket delete
// affordance, because the rules are read and written on the connected node.
const routingDialogOpen = ref(false)
const residencyDialogOpen = ref(false)

// Per-version copy list; the connected node answers for its own objects only.
const locationsKey = ref<string | null>(null)

// ── Bucket sync ─────────────────────────────────────────────────────────────
const syncDialogOpen = ref(false)
const syncSource = ref<{ bucket: string; prefix: string; nodeId: string | null }>({
  bucket: '',
  prefix: '',
  nodeId: null,
})
const syncPanelOpen = ref(false)

interface BucketSyncInfo {
  outgoing: number
  incoming: number
  /** Local-side key prefixes ('' = whole bucket) for row indicators. */
  prefixes: string[]
}
// (nodeId, bucket) → relationship summary, from ONE batched direction=both
// listing on bucket-list load (sidebar badges + row indicators). BOTH sides
// of every relationship register, so remote buckets browsed here surface the
// sync info the connected node's listing already carries.
const syncByBucket = ref<Map<string, BucketSyncInfo>>(new Map())
let syncOverviewRequestId = 0

// A missing/self node id in an ARN means the connected node.
function syncKeyFor(nodeId: string | null | undefined, bucketName: string): string {
  const node = !nodeId || realmNodes.isLocalNode(nodeId) ? (realmNodes.localNodeId.value ?? '') : nodeId
  return syncBucketKey(node, bucketName)
}

async function loadSyncOverview() {
  if (!authToken.value) return
  const requestId = ++syncOverviewRequestId
  try {
    const response = await listSyncRelationships({ direction: 'both' })
    if (requestId !== syncOverviewRequestId) return
    const map = new Map<string, BucketSyncInfo>()
    const add = (arn: string, direction: 'outgoing' | 'incoming') => {
      const parsed = parseArunaArn(arn)
      if (!parsed) return
      const key = syncKeyFor(parsed.nodeId, parsed.bucket)
      const info = map.get(key) ?? { outgoing: 0, incoming: 0, prefixes: [] }
      info[direction]++
      info.prefixes.push(parsed.prefix)
      map.set(key, info)
    }
    // Each relationship touches two buckets: its source has an outgoing sync,
    // its target an incoming one. Dedupe: a same-node relationship appears in
    // both response lists.
    const seen = new Set<string>()
    for (const relationship of [...response.outgoing, ...response.incoming]) {
      if (seen.has(relationship.id)) continue
      seen.add(relationship.id)
      add(relationship.source, 'outgoing')
      add(relationship.target, 'incoming')
    }
    syncByBucket.value = map
  } catch {
    // Badges are a progressive enhancement: a transient failure keeps the
    // previous state instead of tearing the indicators down.
  }
}

const bucketSyncInfo = computed(
  () => syncByBucket.value.get(syncKeyFor(remoteNodeId.value, bucket.value)) ?? null,
)
const bucketSyncCount = computed(() =>
  bucketSyncInfo.value ? bucketSyncInfo.value.outgoing + bucketSyncInfo.value.incoming : 0,
)

// Subtle per-row indicator: the row's key overlaps a synced prefix.
function keyIsSynced(key: string): boolean {
  const info = bucketSyncInfo.value
  if (!info) return false
  return info.prefixes.some((prefix) => prefixesOverlap(key, prefix))
}

const showSyncButton = computed(
  () => Boolean(bucket.value) && !isWorkspaceBucket(bucket.value) && Boolean(authToken.value),
)

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

// ── Reference visibility ────────────────────────────────────────────────────
// One /staging/references load per opened LOCAL bucket (staging references
// live on the connected node); remote browsing skips the listing entirely.
const references = useStagingReferences(
  bucket,
  computed(() => !remoteNodeId.value),
)
const referenceStats = computed(() => references.stats.value)
// Header chip: total referenced count + bytes for the browsed bucket, with a
// per-source popover breakdown. Hidden when the bucket is remote or nothing
// is referenced.
const showReferenceStats = computed(() => !remoteNodeId.value && referenceStats.value.count > 0)

// Frontend-resolved provenance anchor: staging references live on the node
// hosting the browsed bucket, so its label anchors "connector X on node Y".
const hostingNodeLabel = computed(() => {
  const nodeId = remoteNodeId.value ?? realmNodes.localNodeId.value
  return nodeId ? realmNodes.displayName(nodeId) : null
})

// Breakdown row label; connector names resolve lazily via connectorsById.
function referenceGroupLabel(group: ReferenceSourceGroup): string {
  return referenceSourceName(
    { kind: group.kind, originNodeId: group.originNodeId, connectorId: group.connectorId },
    {
      connectorName: connectorName(group.connectorId),
      nodeLabel: realmNodes.displayName,
      hostingNodeLabel: hostingNodeLabel.value,
    },
  )
}

// The list lives in the composable, not here, so leaving the view and coming
// back re-renders the previous buckets instead of reloading from empty.
const bucketList = useBuckets()
const buckets = bucketList.buckets
const bucketsLoaded = bucketList.loaded
const bucketsLoading = bucketList.loading
const bucketsRefreshing = bucketList.refreshing
const bucketsError = bucketList.error
const bucketsAuthError = bucketList.authError

// Per-run ws-<jobId> scratch buckets stay out of the main list; they live in a
// collapsed "System workspaces" group at the bottom of the sidebar. Deep links
// into a ws- bucket still open it (the route drives the listing), and the
// group auto-expands so the open bucket is visible in the sidebar.
const regularBuckets = computed(() => buckets.value.filter((entry) => !isWorkspaceBucket(entry.name)))
const workspaceBuckets = computed(() => buckets.value.filter((entry) => isWorkspaceBucket(entry.name)))
const workspacesOpen = ref(false)

// ONE flat sidebar list: pinned buckets first (any node, remote entries carry
// a node annotation), then every local bucket that is not already pinned.
interface SidebarBucketEntry {
  bucket: string
  /** Hosting node; null = the connected node. */
  nodeId: string | null
  pinned: boolean
}
const sidebarBuckets = computed<SidebarBucketEntry[]>(() => {
  const pinned = shortcuts.pinned.value.map((entry) => ({
    bucket: entry.bucket,
    nodeId: entry.nodeId ?? null,
    pinned: true,
  }))
  const pinnedLocal = new Set(pinned.filter((entry) => !entry.nodeId).map((entry) => entry.bucket))
  const locals = regularBuckets.value
    .filter((entry) => !pinnedLocal.has(entry.name))
    .map((entry) => ({ bucket: entry.name, nodeId: null, pinned: false }))
  return [...pinned, ...locals]
})

// "Recently browsed" only surfaces targets the list above does not already
// show (pins are filtered in the store, listed local buckets here), so the
// section stays non-redundant; in practice it holds remote buckets opened
// via search without pinning them.
const recentBuckets = computed(() => {
  const visible = new Set(
    sidebarBuckets.value.map((entry) => `${entry.nodeId ?? ''}/${entry.bucket}`),
  )
  return shortcuts.recent.value.filter(
    (entry) => !visible.has(`${entry.nodeId ?? ''}/${entry.bucket}`),
  )
})

const folders = ref<FolderEntry[]>([])
const objects = ref<ObjectEntry[]>([])
const nextToken = ref<string | undefined>(undefined)
const listLoading = ref(false)
const listError = ref<string | null>(null)
const listAuthError = ref(false)

const newBucketName = ref('')
const creatingBucket = ref(false)
const createBucketError = ref<string | null>(null)

const keyTail = computed(() => s3.activeKey.value?.accessKeyId.slice(-4) ?? '')

const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
const stripDrag = ref(false)
const uploadRestrictionError = ref<string | null>(null)

const addDataOpen = ref(false)
const staging = useStaging()
// Staging jobs side panel: config-gated (no job-listing endpoint on today's
// backend). The dialog's connector tab covers registered connectors regardless.
const stagingJobsEnabled = featureEnabled('stagingJobs')
const residencyPoliciesEnabled = featureEnabled('placementAdmin')
const stagingPanelOpen = ref(false)

// ALL uploads (toolbar, drop zones and the Add data dialog) run through the
// shared persistent queue; the floating transfers panel renders their
// progress. When one completes into the open bucket, refresh the listing.
const uploadQueue = useUploadQueue()
watch(uploadQueue.lastCompleted, (completed) => {
  if (completed && completed.bucket === bucket.value && completed.nodeId === remoteNodeId.value) {
    void loadObjects()
  }
})

// Keys visible in the current listing; queued uploads targeting one of them
// get an "overwrites existing object" marker.
const listedKeys = computed(() => new Set(objects.value.map((object) => object.key)))

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

type DeleteTarget =
  | { type: 'object'; bucket: string; object: ObjectEntry; nodeId: string | null }
  | {
      type: 'folder'
      bucket: string
      folder: FolderEntry
      nodeId: string | null
      /** Object count under the prefix; null while the recursive listing runs. */
      count: number | null
      countTruncated: boolean
    }
const deleteTarget = ref<DeleteTarget | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

// Bucket deletion is destructive and irreversible (it removes the container and
// every object inside), so it gets its own type-to-confirm dialog rather than
// the single-click object/folder delete above.
interface BucketDeleteTarget {
  bucket: string
  nodeId: string | null
  /** Object count under the bucket; null while the walk runs, -1 when unknown. */
  count: number | null
  /** Summed size of the counted objects; a lower bound when countTruncated. */
  bytes: number
  countTruncated: boolean
}
const bucketDeleteTarget = ref<BucketDeleteTarget | null>(null)
const bucketDeleteBusy = ref(false)
const bucketDeleteError = ref<string | null>(null)
const bucketDeleteConfirm = ref('')
// The typed name must match exactly before the destructive action unlocks.
const bucketDeleteConfirmed = computed(
  () => bucketDeleteTarget.value !== null && bucketDeleteConfirm.value === bucketDeleteTarget.value.bucket,
)

const newFolderOpen = ref(false)
const newFolderName = ref('')
const newFolderBusy = ref(false)
const newFolderError = ref<string | null>(null)
const newFolderInvalid = computed(() => {
  const name = newFolderName.value.trim()
  return !name || name.includes('/')
})

let listRequestId = 0

function clearObjectListing() {
  ++listRequestId
  folders.value = []
  objects.value = []
  nextToken.value = undefined
  listLoading.value = false
  listError.value = null
  listAuthError.value = false
  remoteBrowseBlocked.value = false
  deleteTarget.value = null
}

async function loadObjects(more = false) {
  if (!contextReady.value || !effectiveEndpoint.value || !bucket.value) return
  if (!s3.canRead(bucket.value, s3Prefix.value, remoteNodeId.value)) {
    listError.value = 'This session does not allow reading the selected bucket and prefix.'
    return
  }
  const requestId = ++listRequestId
  const targetBucket = bucket.value
  const targetPrefix = s3Prefix.value
  const targetNode = remoteNodeId.value
  const continuation = more ? nextToken.value : undefined
  listLoading.value = true
  listError.value = null
  listAuthError.value = false
  remoteBrowseBlocked.value = false
  try {
    const page = await s3.listObjects(targetBucket, targetPrefix, continuation, targetNode)
    if (requestId !== listRequestId) return
    folders.value = more ? [...folders.value, ...page.folders] : page.folders
    objects.value = more ? [...objects.value, ...page.objects] : page.objects
    nextToken.value = page.nextToken
  } catch (err) {
    if (requestId === listRequestId) {
      // A remote endpoint the browser cannot reach (CORS rejection or the node
      // being down) degrades to the hosted-elsewhere panel, never a raw error.
      if (targetNode && isS3NetworkError(err)) {
        remoteBrowseBlocked.value = true
      } else {
        listError.value = s3ErrorMessage(err)
        listAuthError.value = isS3AuthError(err)
      }
    }
  } finally {
    if (requestId === listRequestId) listLoading.value = false
  }
}

// Everything except the bucket list, which has its own cache-aware entry points.
function reloadContext() {
  void loadSyncOverview()
  if (bucket.value) {
    void loadObjects()
    void references.reload()
  }
}

function refreshAll() {
  void bucketList.refresh()
  reloadContext()
}

// On a fresh page load the S3 endpoint arrives asynchronously (from the
// /info bootstrap), so loading must wait for both the key and the endpoint
// and re-fire once the endpoint resolves.
watch(
  [contextFingerprint, effectiveEndpoint],
  ([context, endpoint]) => {
    clearObjectListing()
    if (!context) return
    if (!endpoint) return
    // Cached buckets show at once; useBuckets scopes them by session and
    // endpoint, so another node or group never inherits this list.
    void bucketList.ensure()
    reloadContext()
  },
  { immediate: true },
)

// effectiveEndpoint is included so a remote deep link starts listing once the
// realm document (with the remote node's published S3 URL) arrives.
watch([bucket, prefix, remoteNodeId, effectiveEndpoint], () => {
  clearObjectListing()
  if (bucket.value && contextReady.value) void loadObjects()
})

watch(
  () => route.query.group,
  (group) => {
    const next = routeString(group)
    if (next) selectedGroupId.value = next
  },
)

watch(
  bucket,
  (name) => {
    if (name && isWorkspaceBucket(name)) workspacesOpen.value = true
  },
  { immediate: true },
)

// Every opened bucket (sidebar click, search hit, or deep link) lands in
// "Recently browsed"; the shortcut store drops ws- scratch buckets itself.
watch(
  [bucket, remoteNodeId],
  ([name, nodeId]) => {
    if (name) shortcuts.recordRecent(name, nodeId)
  },
  { immediate: true },
)

// Navigating to the current location must reload, not clear: a push to an
// identical route never fires the [bucket, prefix] watch, so a pre-cleared
// listing would stay empty (the "home shows an empty bucket" bug).
function openBucketOn(name: string, nodeId: string | null, groupId = selectedGroupId.value) {
  if (name === bucket.value && !prefix.value && nodeId === remoteNodeId.value) {
    void loadObjects()
    return
  }
  void router.push({
    name: 'bucket',
    params: { bucketId: name },
    query: {
      ...(nodeId ? { node: nodeId } : {}),
      ...(groupId ? { group: groupId } : {}),
    },
  })
}

function openBucket(name: string) {
  openBucketOn(name, null)
}

function openSearchHit(hit: BucketSearchHit) {
  selectedGroupId.value = hit.group_id
  selectedGroupLabel.value = hit.group_name ?? hit.group_id
  openBucketOn(hit.bucket, realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id, hit.group_id)
}

function navigateTo(path: string) {
  if (path === prefix.value) {
    void loadObjects()
    return
  }
  void router.push({
    name: 'bucket',
    params: { bucketId: bucket.value },
    query: {
      ...(path ? { prefix: path } : {}),
      ...(remoteNodeId.value ? { node: remoteNodeId.value } : {}),
      ...(selectedGroupId.value ? { group: selectedGroupId.value } : {}),
    },
  })
}

function openFolder(folder: FolderEntry) {
  navigateTo(folder.prefix.replace(/\/$/, ''))
}

async function createBucket() {
  const name = newBucketName.value.trim()
  if (!name || !contextReady.value || !s3.canWrite(name, undefined, remoteNodeId.value)) return
  creatingBucket.value = true
  createBucketError.value = null
  try {
    await s3.createBucket(name)
    newBucketName.value = ''
    await bucketList.refresh()
    openBucket(name)
  } catch (err) {
    createBucketError.value = s3ErrorMessage(err)
  } finally {
    creatingBucket.value = false
  }
}

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

function pickFiles() {
  if (!canWriteCurrentPrefix.value) return
  fileInput.value?.click()
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void requestUpload(Array.from(input.files))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  if (!canWriteCurrentPrefix.value || !bucket.value || !event.dataTransfer?.files.length) return
  void requestUpload(Array.from(event.dataTransfer.files))
}

function onStripDrop(event: DragEvent) {
  stripDrag.value = false
  if (!canWriteCurrentPrefix.value || !bucket.value || !event.dataTransfer?.files.length) return
  void requestUpload(Array.from(event.dataTransfer.files))
}

// The selected group is part of the active session context, never inferred
// from a long-lived credential list.
const activeGroupId = computed(() =>
  contextReady.value ? s3.activeContext.value?.groupId ?? null : null,
)
const canWriteCurrentPrefix = computed(() =>
  Boolean(
    contextReady.value &&
      bucket.value &&
      s3.canWritePrefix(bucket.value, s3Prefix.value, remoteNodeId.value),
  ),
)
const writeRestrictionMessage = computed(() =>
  canWriteCurrentPrefix.value
    ? null
    : 'This session is read-only for the selected bucket or prefix. Upload, create, and delete actions are unavailable.',
)

// Canonical data watch prefix for the browsed bucket/prefix. It uses the
// active session's explicit group and the node serving the S3 endpoint, so an
// upload watch is never attached to another context.
const watchNodeId = computed(
  () =>
    // Browsing a remote node: uploads there emit under that node's id.
    remoteNodeId.value ??
    s3EndpointNodeId(
      s3.endpoint.value,
      nodeInfo.value
        ? { nodeId: nodeInfo.value.node.peer_id, s3Url: nodeInfo.value.services?.interfaces?.s3?.url }
        : null,
      (realmInfo.value?.nodes ?? []).map((node) => ({ nodeId: node.node_id, s3Url: node.info?.urls?.s3 })),
    ),
)
const watchPathPrefix = computed(() => {
  const groupId = activeGroupId.value
  const nodeId = watchNodeId.value
  if (!groupId || !nodeId || !bucket.value) return ''
  return dataWatchPathPrefix(groupId, nodeId, bucket.value, s3Prefix.value)
})

// 30s-cached usage fetch that never throws: any failure returns null so the
// precheck simply degrades to "just upload".
let cachedUsage: { groupId: string; at: number; usage: UsageResponse } | null = null
async function groupUsageFresh(groupId: string): Promise<UsageResponse | null> {
  if (cachedUsage && cachedUsage.groupId === groupId && Date.now() - cachedUsage.at < 30_000) {
    return cachedUsage.usage
  }
  try {
    const usage = await getGroupUsage(groupId)
    cachedUsage = { groupId, at: Date.now(), usage }
    return usage
  } catch {
    return null
  }
}

const precheck = ref<{
  context: UploadContext
  totalBytes: number
  projected: QuotaAssessment
  current: QuotaAssessment
} | null>(null)

interface UploadContext {
  files: File[]
  bucket: string
  prefix: string
  nodeId: string | null
  groupId: string | null
}

function captureUploadContext(files: File[]): UploadContext | null {
  if (!contextReady.value || !effectiveEndpoint.value || !bucket.value || !activeGroupId.value) return null
  if (
    files.some((file) =>
      !s3.canWrite(bucket.value, `${s3Prefix.value}${file.name}`, remoteNodeId.value),
    )
  ) {
    uploadRestrictionError.value = 'This session does not allow one or more selected upload paths.'
    return null
  }
  return {
    files,
    bucket: bucket.value,
    prefix: s3Prefix.value,
    nodeId: remoteNodeId.value,
    groupId: activeGroupId.value,
  }
}

// Advisory only: this may warn but never blocks. Every path ends in an upload.
async function requestUpload(files: File[]) {
  uploadRestrictionError.value = null
  const context = captureUploadContext(files)
  if (!context) return
  const groupId = context.groupId
  if (groupId) {
    const usage = await groupUsageFresh(groupId)
    const quota = usage?.quota
    if (usage && quota && quota.quota_bytes != null) {
      const used = quotaCountedBytes(usage)
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
      const projected = assessQuota(quota, used + totalBytes)
      if (projected.state === 'over-quota' || projected.state === 'over-ceiling') {
        precheck.value = { context, totalBytes, projected, current: assessQuota(quota, used) }
        return
      }
    }
  }
  uploadFiles(context)
}

function confirmPrecheckUpload() {
  const context = precheck.value?.context ?? null
  precheck.value = null
  if (context) uploadFiles(context)
}

// Per-file enqueue so every item carries its exact target key plus the
// overwrite marker from the listing visible at enqueue time. Progress and
// cancel/retry live in the floating transfers panel; the session fingerprint
// inside the queue guards against key/endpoint changes.
function uploadFiles(context: UploadContext) {
  const checkOverwrite = context.bucket === bucket.value && context.prefix === s3Prefix.value
  for (const file of context.files) {
    const key = `${context.prefix}${file.name}`
    uploadQueue.enqueue([file], {
      bucket: context.bucket,
      prefix: context.prefix,
      groupId: context.groupId,
      nodeId: context.nodeId,
      key,
      overwrite: checkOverwrite && listedKeys.value.has(key),
    })
  }
}

const previewOpen = ref(false)
const previewObject = ref<ObjectEntry | null>(null)
function openPreview(object: ObjectEntry) {
  previewObject.value = object
  previewOpen.value = true
}

// Connector names for the preview origin line and the stats breakdown: ONE
// listing per credential group (the bucket namespace IS that group), loaded
// lazily once a referenced entry actually carries a connector id.
const connectorsById = ref<Map<string, SourceConnectorSummary>>(new Map())
let connectorsLoadedFor: string | null = null
watch(
  [activeGroupId, () => references.stats.value],
  async ([groupId, stats]) => {
    if (!groupId || connectorsLoadedFor === groupId) return
    if (!stats.groups.some((group) => group.connectorId)) return
    connectorsLoadedFor = groupId
    try {
      const response = await listGroupConnectors(groupId)
      connectorsById.value = new Map(
        response.connectors.map((connector) => [connector.connector_id, connector]),
      )
    } catch {
      // Names degrade to kind labels; retry on the next group/stats change.
      connectorsLoadedFor = null
    }
  },
  { immediate: true },
)

function connectorName(connectorId: string | undefined): string | null {
  if (!connectorId) return null
  return connectorsById.value.get(connectorId)?.name ?? null
}

function referencedFrom(key: string): string {
  const entry = references.referencedByKey.value.get(key)
  if (!entry) return 'Referenced from an external source'
  return `Referenced from ${referenceSourceLabel(entry, {
    connectorName: connectorName(entry.connector_id),
    nodeLabel: realmNodes.displayName,
    hostingNodeLabel: hostingNodeLabel.value,
  })}`
}

function prefixReferenceSummary(folderPrefix: string): string {
  const entries = references.entries.value.filter(
    (entry) => entry.referenced && entry.key.startsWith(folderPrefix),
  )
  const sources = new Set(
    entries.map((entry) =>
      referenceSourceName(
        { kind: entry.kind, originNodeId: entry.origin_node_id, connectorId: entry.connector_id },
        {
          connectorName: connectorName(entry.connector_id),
          nodeLabel: realmNodes.displayName,
          hostingNodeLabel: hostingNodeLabel.value,
        },
      ),
    ),
  )
  return `Contains ${entries.length} referenced object${entries.length === 1 ? '' : 's'} from ${[...sources].join(', ') || 'external sources'}. Open the folder for exact source paths.`
}

const previewReference = computed(() =>
  previewObject.value
    ? (references.referencedByKey.value.get(previewObject.value.key) ?? null)
    : null,
)
// Structured provenance so the preview pane can render a real connector link
// (group-scoped deep link) instead of plain text.
const previewReferencedFrom = computed(() => {
  const entry = previewReference.value
  if (!entry) return null
  return {
    label: referenceSourceLabel(entry, {
      connectorName: connectorName(entry.connector_id),
      nodeLabel: realmNodes.displayName,
      hostingNodeLabel: hostingNodeLabel.value,
    }),
    connectorId: entry.connector_id ?? null,
    groupId: entry.connector_id ? activeGroupId.value : null,
    // Native references have no connector; link their provenance to the
    // origin node's detail surface on the Status page instead.
    originNodeId: entry.origin_node_id ?? null,
  }
})
// HEAD fallback for remote buckets: the connected node's /staging/references
// listing does not cover them, so probe the single previewed object instead.
const previewProbeReference = computed(() => Boolean(remoteNodeId.value))

async function download(object: ObjectEntry) {
  const sourceBucket = bucket.value
  try {
    const url = await s3.downloadUrl(sourceBucket, object.key, remoteNodeId.value)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = object.name
    anchor.rel = 'noopener'
    anchor.click()
  } catch (err) {
    listError.value = s3ErrorMessage(err)
    listAuthError.value = isS3AuthError(err)
  }
}

function openDeleteObject(object: ObjectEntry) {
  if (!s3.canWrite(bucket.value, object.key, remoteNodeId.value)) return
  deleteError.value = null
  deleteTarget.value = { type: 'object', bucket: bucket.value, object, nodeId: remoteNodeId.value }
}

// Folder delete: the confirm dialog shows how many objects the recursive walk
// finds (capped; '+' marks a truncated count) before anything is removed.
const FOLDER_COUNT_LIMIT = 2000
function openDeleteFolder(folder: FolderEntry) {
  if (!s3.canDeletePrefix(bucket.value, folder.prefix, remoteNodeId.value)) return
  deleteError.value = null
  deleteTarget.value = {
    type: 'folder',
    bucket: bucket.value,
    folder,
    nodeId: remoteNodeId.value,
    count: null,
    countTruncated: false,
  }
  void resolveFolderCount(folder)
}

async function resolveFolderCount(folder: FolderEntry) {
  try {
    const result = await s3.listObjectsRecursive(
      bucket.value,
      folder.prefix,
      FOLDER_COUNT_LIMIT,
      remoteNodeId.value,
    )
    const target = deleteTarget.value
    if (target?.type === 'folder' && target.folder.prefix === folder.prefix) {
      target.count = result.objects.length
      target.countTruncated = result.truncated
    }
  } catch {
    // The count stays unknown; deleting is still possible.
    const target = deleteTarget.value
    if (target?.type === 'folder' && target.folder.prefix === folder.prefix) {
      target.count = -1
    }
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  const target = deleteTarget.value
  const targetKey = target.type === 'object' ? target.object.key : target.folder.prefix
  const deletionAllowed =
    target.type === 'object'
      ? s3.canWrite(target.bucket, targetKey, target.nodeId)
      : s3.canDeletePrefix(target.bucket, targetKey, target.nodeId)
  if (!deletionAllowed) {
    deleteError.value = 'This session no longer allows deleting the selected path.'
    return
  }
  deleteBusy.value = true
  deleteError.value = null
  try {
    if (target.type === 'object') {
      await s3.deleteObject(target.bucket, target.object.key, target.nodeId)
    } else {
      const result = await s3.deletePrefix(target.bucket, target.folder.prefix, target.nodeId)
      // A deleted prefix invalidates any preview under it.
      if (
        target.bucket === bucket.value &&
        previewObject.value?.key.startsWith(target.folder.prefix)
      ) {
        previewOpen.value = false
        previewObject.value = null
      }
      if (result.errors.length) {
        const first = result.errors[0]
        deleteError.value = `${result.deleted} object${result.deleted === 1 ? '' : 's'} deleted, ${result.errors.length} failed. First failure: ${first.key}: ${first.message}`
        if (target.bucket === bucket.value) await loadObjects()
        return
      }
    }
    deleteTarget.value = null
    if (target.bucket === bucket.value) await loadObjects()
    if (target.type === 'folder') void references.reload()
  } catch (err) {
    deleteError.value = s3ErrorMessage(err)
  } finally {
    deleteBusy.value = false
  }
}

// Bucket delete only exposes local (connected-node) buckets: a remote node's S3
// endpoint is often CORS-blocked from this origin, so a browser-side DeleteBucket
// there would fail confusingly. openDeleteBucket also kicks off the object walk
// that fills the dialog's "contains N objects, X" line.
function openDeleteBucket(name: string, nodeId: string | null) {
  if (!s3.canDeletePrefix(name, '', nodeId)) return
  bucketDeleteError.value = null
  bucketDeleteConfirm.value = ''
  bucketDeleteTarget.value = { bucket: name, nodeId, count: null, bytes: 0, countTruncated: false }
  void resolveBucketStats(name, nodeId)
}

async function resolveBucketStats(name: string, nodeId: string | null) {
  try {
    const result = await s3.listObjectsRecursive(name, '', FOLDER_COUNT_LIMIT, nodeId)
    const target = bucketDeleteTarget.value
    if (target?.bucket !== name || target.nodeId !== nodeId) return
    target.count = result.objects.length
    target.bytes = result.objects.reduce((sum, object) => sum + (object.size ?? 0), 0)
    target.countTruncated = result.truncated
  } catch {
    // The count stays unknown; deleting is still possible (empty via purge).
    const target = bucketDeleteTarget.value
    if (target?.bucket === name && target.nodeId === nodeId) target.count = -1
  }
}

async function confirmDeleteBucket() {
  const target = bucketDeleteTarget.value
  if (!target || !bucketDeleteConfirmed.value) return
  if (!s3.canDeletePrefix(target.bucket, '', target.nodeId)) {
    bucketDeleteError.value = 'This session no longer allows deleting this bucket.'
    return
  }
  bucketDeleteBusy.value = true
  bucketDeleteError.value = null
  try {
    // S3 only removes an empty bucket. Skip the purge only when the walk proved
    // it empty; otherwise batch-delete every object first (deletePrefix paginates
    // and DeleteObjects in 1000-key batches, reused from the folder delete).
    const knownEmpty = target.count === 0 && !target.countTruncated
    if (!knownEmpty) {
      const result = await s3.deletePrefix(target.bucket, '', target.nodeId)
      if (result.errors.length) {
        const first = result.errors[0]
        bucketDeleteError.value = `${result.deleted} object${result.deleted === 1 ? '' : 's'} deleted, ${result.errors.length} could not be removed, so the bucket was kept. First failure: ${first.key}: ${first.message}`
        return
      }
    }
    await s3.deleteBucket(target.bucket, target.nodeId)
    shortcuts.remove(target.bucket, target.nodeId)
    const wasOpen = bucket.value === target.bucket && remoteNodeId.value === target.nodeId
    bucketDeleteTarget.value = null
    bucketDeleteConfirm.value = ''
    // Leave the dead bucket's route before refreshing so the listing is clean.
    if (wasOpen) await router.push({ name: 'buckets' })
    await bucketList.refresh()
    void loadSyncOverview()
  } catch (err) {
    bucketDeleteError.value = isS3BucketNotEmptyError(err)
      ? 'The bucket still holds data after the purge. This usually means object versioning is enabled, so older versions and delete markers remain that the browser cannot remove. Ask a node administrator to delete it.'
      : s3ErrorMessage(err)
  } finally {
    bucketDeleteBusy.value = false
  }
}

const isEmpty = computed(
  () => !listLoading.value && !listError.value && !folders.value.length && !objects.value.length,
)
</script>

<template>
  <div>
    <PageHeader
      title="Data"
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
            <Loader2 v-if="contextBusy" class="h-4 w-4 animate-spin" />
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
          <Button variant="outline" size="sm" @click="refreshAll"><RefreshCw class="h-4 w-4" /> Refresh</Button>
          <!-- Staging jobs are connected-node global, not per bucket. -->
          <Button v-if="stagingJobsEnabled" variant="outline" size="sm" @click="stagingPanelOpen = true">
            <HardDriveDownload class="h-4 w-4" /> Staging
            <Badge v-if="staging.runningCount.value" variant="secondary" class="ml-1">{{ staging.runningCount.value }}</Badge>
          </Button>
        </template>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section v-if="!s3.connectedEndpoint.value && !bootstrapped" class="surface flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" /> Connecting to the node…
      </section>

      <section v-else-if="!s3.connectedEndpoint.value" class="surface border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-900 dark:text-amber-200">
        <div class="flex items-start gap-3">
          <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
          <p>This node does not advertise an S3 endpoint, so the data manager cannot connect.</p>
        </div>
      </section>

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
            <p v-else-if="!selectedGroupId" class="mt-2 text-sm text-muted-foreground">
              Select a group above. The portal mints a node-local session only after that explicit selection and keeps it in memory only.
            </p>
            <p v-else class="mt-2 text-sm text-muted-foreground">
              Open group {{ selectedGroupLabel || selectedGroupId }} on {{ requiredNodeName }}. Expired sessions block new operations and are replaced only after this explicit action.
            </p>
            <p v-if="contextError" class="mt-3 text-xs text-destructive">{{ contextError }}</p>
          </div>
        </div>
      </section>

      <section v-else class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div
          v-if="sessionWarning"
          class="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 lg:col-span-2 dark:text-amber-300"
        >
          {{ sessionWarning }}
        </div>
        <aside class="space-y-3">
          <div class="surface p-3">
            <BucketSearchBox :sync-by-bucket="syncByBucket" @open="openSearchHit" @sync="openSyncFromHit" />
          </div>

          <div class="surface overflow-hidden" :aria-busy="bucketsRefreshing">
            <header class="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 class="text-sm font-semibold text-foreground">Buckets</h2>
              <div class="flex items-center gap-2">
                <!-- Background revalidation only: the cached list stays readable behind it. -->
                <Spinner v-if="bucketsRefreshing" label="Refreshing buckets…" />
                <Badge variant="outline">{{ sidebarBuckets.length }}</Badge>
              </div>
            </header>
            <div v-if="bucketsLoading" class="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading buckets…
            </div>
            <div v-else-if="bucketsError && bucketsAuthError" class="m-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <p>The temporary S3 session was rejected. Close it, then explicitly open this node and group again.</p>
              <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">{{ bucketsError }}</p>
              <Button variant="outline" size="sm" class="mt-2" @click="s3.clearSessions()"><KeyRound class="h-3.5 w-3.5" /> Close temporary sessions</Button>
            </div>
            <p v-else-if="bucketsError && !bucketsLoaded" class="px-4 py-3 text-xs text-destructive">{{ bucketsError }}</p>
            <template v-else>
              <!-- A failed revalidation keeps the last good list and reports itself above it. -->
              <p v-if="bucketsError" class="border-b border-border/70 px-4 py-2 text-xs text-destructive">{{ bucketsError }}</p>
              <ul v-if="sidebarBuckets.length" class="max-h-[420px] overflow-y-auto py-1">
                <li
                  v-for="entry in sidebarBuckets"
                  :key="`${entry.nodeId ?? 'local'}/${entry.bucket}`"
                >
                  <BucketRow
                    :bucket="entry.bucket"
                    :node-id="entry.nodeId"
                    :pinned="entry.pinned"
                    :synced="syncByBucket.has(syncKeyFor(entry.nodeId, entry.bucket))"
                    :active="entry.bucket === bucket && (entry.nodeId ?? null) === remoteNodeId"
                    @open="openBucketOn(entry.bucket, entry.nodeId)"
                    @toggle-pin="shortcuts.togglePin(entry.bucket, entry.nodeId)"
                  >
                    <!-- Delete is offered for local buckets only; remote S3
                         endpoints are usually CORS-blocked from this origin. -->
                    <template v-if="entry.nodeId === null" #actions>
                      <button
                        type="button"
                        class="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                        :class="!s3.canDeletePrefix(entry.bucket, '', entry.nodeId) && 'cursor-not-allowed opacity-40'"
                        :title="`Delete ${entry.bucket}`"
                        :aria-label="`Delete bucket ${entry.bucket}`"
                        :disabled="!s3.canDeletePrefix(entry.bucket, '', entry.nodeId)"
                        @mousedown.prevent
                        @click="openDeleteBucket(entry.bucket, entry.nodeId)"
                      >
                        <Trash2 class="h-3 w-3" />
                      </button>
                    </template>
                  </BucketRow>
                </li>
              </ul>
              <p v-else class="px-4 py-4 text-xs text-muted-foreground">No buckets in this group yet.</p>
              <div v-if="recentBuckets.length" class="border-t border-border/70 py-1">
                <p class="flex items-center gap-1.5 px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  <History class="h-3.5 w-3.5 shrink-0" />
                  Recently browsed
                </p>
                <ul class="pb-1">
                  <li v-for="entry in recentBuckets" :key="`${entry.nodeId ?? 'local'}/${entry.bucket}`">
                    <BucketRow
                      :bucket="entry.bucket"
                      :node-id="entry.nodeId"
                      :pinned="false"
                      :synced="syncByBucket.has(syncKeyFor(entry.nodeId, entry.bucket))"
                      :active="entry.bucket === bucket && (entry.nodeId ?? null) === remoteNodeId"
                      @open="openBucketOn(entry.bucket, entry.nodeId)"
                      @toggle-pin="shortcuts.togglePin(entry.bucket, entry.nodeId)"
                    />
                  </li>
                </ul>
              </div>
              <div v-if="workspaceBuckets.length" class="border-t border-border/70 py-1">
                <button
                  type="button"
                  class="flex w-full items-center gap-1 px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  title="Per-run scratch buckets (ws-…) created by compute jobs"
                  @click="workspacesOpen = !workspacesOpen"
                >
                  <ChevronRight :class="['h-3.5 w-3.5 shrink-0 transition-transform', workspacesOpen && 'rotate-90']" />
                  System workspaces
                  <Badge variant="outline" class="ml-auto">{{ workspaceBuckets.length }}</Badge>
                </button>
                <ul v-if="workspacesOpen" class="max-h-56 overflow-y-auto pb-1">
                  <li v-for="entry in workspaceBuckets" :key="entry.name">
                    <button
                      class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs hover:bg-muted"
                      :class="entry.name === bucket && !remoteNodeId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
                      @click="openBucket(entry.name)"
                    >
                      <Boxes class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span class="truncate font-mono">{{ entry.name }}</span>
                    </button>
                  </li>
                </ul>
              </div>
            </template>
            <footer class="space-y-2 border-t border-border p-3">
              <div class="flex gap-2">
                <Input v-model="newBucketName" placeholder="new-bucket-name" class="h-8 font-mono text-xs" @keyup.enter="createBucket" />
                <Button variant="outline" size="sm" :disabled="creatingBucket || !newBucketName.trim() || !s3.canWrite(newBucketName.trim(), undefined, remoteNodeId)" title="Create a bucket only when the session permits this path" @click="createBucket">
                  <FolderPlus class="h-4 w-4" />
                </Button>
              </div>
              <p v-if="createBucketError" class="text-xs text-destructive">{{ createBucketError }}</p>
              <p v-else-if="newBucketName.trim() && !s3.canWrite(newBucketName.trim(), undefined, remoteNodeId)" class="text-xs text-muted-foreground">This session does not allow creating that bucket.</p>
            </footer>
          </div>
        </aside>

        <div class="min-w-0 space-y-4">
          <div v-if="!bucket" class="surface grid place-items-center p-12 text-sm text-muted-foreground">
            Select a bucket to browse its objects.
          </div>

          <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <Breadcrumbs :bucket="bucket" :path="prefix" @navigate="navigateTo" />
                <Badge
                  v-if="remoteNodeId"
                  variant="outline"
                  class="shrink-0 text-[10px]"
                  :title="remoteNodeId"
                >
                  on {{ realmNodes.displayName(remoteNodeId) }}
                </Badge>
                <Loader2 v-if="listLoading" class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              </div>
              <div class="flex items-center gap-2">
                <input ref="fileInput" type="file" multiple class="hidden" @change="onFileInput" />
                <!-- Same local-only gating as the sidebar delete: remote S3
                     endpoints are usually CORS-blocked from this origin. -->
                <Button
                  v-if="!remoteNodeId"
                  variant="outline"
                  size="icon-sm"
                  class="h-8 w-8 text-destructive hover:text-destructive"
                  :title="`Delete ${bucket}`"
                  aria-label="Delete bucket"
                  :disabled="!s3.canDeletePrefix(bucket, '', null)"
                  @click="openDeleteBucket(bucket, null)"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
                <WatchButton
                  v-if="watchPathPrefix"
                  :path-prefix="watchPathPrefix"
                  event-kind="data_uploaded"
                  :resource-label="`${bucket}/${s3Prefix}`"
                  size="sm"
                />
                <Button
                  v-if="!remoteNodeId"
                  variant="outline"
                  size="sm"
                  title="Where new files in this bucket are stored"
                  @click="routingDialogOpen = true"
                >
                  <Route class="h-4 w-4" /> Routing
                </Button>
                <Button
                  v-if="!remoteNodeId && residencyPoliciesEnabled && isRealmAdmin && isManagementNode"
                  variant="outline"
                  size="sm"
                  title="Residency policies for this bucket"
                  @click="residencyDialogOpen = true"
                >
                  <ShieldCheck class="h-4 w-4" /> Residency
                </Button>
                <Button
                  v-if="showSyncButton"
                  variant="outline"
                  size="sm"
                  :title="bucketSyncCount ? `${bucketSyncCount} sync relationship${bucketSyncCount === 1 ? '' : 's'}, open sync status` : 'Sync relationships for this bucket'"
                  @click="syncPanelOpen = true"
                >
                  <ArrowLeftRight class="h-4 w-4" :class="bucketSyncCount ? 'text-primary' : ''" /> Syncs
                  <Badge v-if="bucketSyncCount" variant="secondary" class="ml-1">{{ bucketSyncCount }}</Badge>
                </Button>
                <Popover v-if="showReferenceStats">
                  <Button
                    variant="outline"
                    size="sm"
                    :title="`${referenceStats.count} referenced object${referenceStats.count === 1 ? '' : 's'} · ${formatBytes(referenceStats.bytes)}, open per-source breakdown`"
                  >
                    <Link2 class="h-4 w-4 text-primary" />
                    <span class="font-mono text-xs">{{ formatBytes(referenceStats.bytes) }}</span>
                    <Badge variant="secondary" class="ml-1">{{ referenceStats.count }}</Badge>
                  </Button>
                  <template #content>
                    <div class="space-y-2">
                      <div>
                        <p class="text-sm font-semibold text-foreground">Referenced data</p>
                        <p class="mt-0.5 text-xs text-muted-foreground">
                          {{ referenceStats.count }} object{{ referenceStats.count === 1 ? '' : 's' }} in this
                          bucket point{{ referenceStats.count === 1 ? 's' : '' }} at data held elsewhere ·
                          {{ formatBytes(referenceStats.bytes) }} in total.
                        </p>
                      </div>
                      <ul class="space-y-1 border-t border-border pt-2">
                        <li
                          v-for="group in referenceStats.groups"
                          :key="group.key"
                          class="flex items-start justify-between gap-3 text-xs"
                        >
                          <span class="min-w-0 text-foreground">
                            <RouterLink
                              v-if="group.connectorId && activeGroupId"
                              :to="{ name: 'groups', params: { id: activeGroupId }, query: { tab: 'sources', connector: group.connectorId } }"
                              class="block truncate text-primary hover:underline"
                              :title="`${referenceGroupLabel(group)}, open the connector`"
                            >
                              {{ referenceGroupLabel(group) }}
                            </RouterLink>
                            <RouterLink
                              v-else-if="group.originNodeId"
                              :to="{ name: 'status', query: { node: group.originNodeId } }"
                              class="block truncate text-primary hover:underline"
                              :title="`${referenceGroupLabel(group)}, open the node on the Status page`"
                            >
                              {{ referenceGroupLabel(group) }}
                            </RouterLink>
                            <span v-else class="block truncate" :title="referenceGroupLabel(group)">{{ referenceGroupLabel(group) }}</span>
                            <span v-if="group.sourcePaths.length" class="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" :title="group.sourcePaths.join('\n')">
                              {{ group.sourcePaths.join(', ') }}<template v-if="group.count > group.sourcePaths.length">, …</template>
                            </span>
                          </span>
                          <span class="shrink-0 font-mono text-muted-foreground">
                            {{ group.count }} · {{ formatBytes(group.bytes) }}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </template>
                </Popover>
                <!-- The Add data pipeline always targets the connected node. -->
                <Button v-if="!remoteBlocked" variant="outline" size="sm" :disabled="!canWriteCurrentPrefix" :title="writeRestrictionMessage ?? 'Create a folder'" @click="openNewFolder"><FolderPlus class="h-4 w-4" /> New folder</Button>
                <Button v-if="!remoteNodeId" size="sm" :disabled="!canWriteCurrentPrefix" :title="writeRestrictionMessage ?? 'Add data'" @click="addDataOpen = true"><Plus class="h-4 w-4" /> Add data</Button>
              </div>
            </div>
            <p v-if="writeRestrictionMessage" class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {{ writeRestrictionMessage }}
            </p>

            <!-- Remote bucket whose endpoint the browser cannot use: an honest
                 info panel instead of a broken listing. -->
            <div v-if="remoteBlocked" class="surface p-8 text-center">
              <CloudOff class="mx-auto h-6 w-6 text-muted-foreground" />
              <p class="mt-3 text-sm font-medium text-foreground">
                Hosted on {{ realmNodes.displayName(remoteNodeId) }}, browsing is unavailable from this origin.
              </p>
              <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {{
                  remoteEndpointMissing
                    ? 'The node does not publish an S3 endpoint, so its objects cannot be listed here.'
                    : 'The node’s S3 endpoint did not answer this browser, it may be unreachable or not allow cross-origin browsing.'
                }}
              </p>
              <div class="mt-4 flex justify-center gap-2">
                <Button v-if="!remoteEndpointMissing" variant="outline" size="sm" @click="loadObjects()">
                  <RefreshCw class="h-3.5 w-3.5" /> Try again
                </Button>
                <Button v-if="showSyncButton" size="sm" @click="openSyncDialog">
                  <ArrowLeftRight class="h-3.5 w-3.5" /> Sync to this node…
                </Button>
              </div>
            </div>

            <template v-else>
            <div
              class="surface overflow-hidden"
              :class="dragActive ? 'ring-2 ring-primary ring-offset-2' : ''"
              @dragover.prevent="dragActive = canWriteCurrentPrefix"
              @dragleave="dragActive = false"
              @drop.prevent="onDrop"
            >
              <div v-if="listError && listAuthError" class="border-b border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                <p>The temporary S3 session was rejected. Close it, then explicitly open this node and group again.</p>
                <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">{{ listError }}</p>
                <Button variant="outline" size="sm" class="mt-2" @click="s3.clearSessions()"><KeyRound class="h-3.5 w-3.5" /> Close temporary sessions</Button>
              </div>
              <p v-else-if="listError" class="border-b border-border px-4 py-3 text-xs text-destructive">{{ listError }}</p>
              <table class="w-full text-sm">
                <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th class="px-4 py-2 text-left font-semibold">Name</th>
                    <th class="px-4 py-2 text-right font-semibold">Size</th>
                    <th class="px-4 py-2 text-left font-semibold">Modified</th>
                    <th class="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="folder in folders"
                    :key="folder.prefix"
                    class="cursor-pointer border-t border-border hover:bg-muted/50"
                    @click="openFolder(folder)"
                  >
                    <td class="px-4 py-2.5">
                      <span class="flex items-center gap-2">
                        <ObjectIcon :name="folder.name" folder class="h-4 w-4" /> {{ folder.name }}/
                        <ArrowLeftRight
                          v-if="keyIsSynced(folder.prefix)"
                          class="h-3 w-3 shrink-0 text-primary/40"
                          aria-label="Covered by a sync relationship"
                        />
                        <!-- Tooltip lives on a span: title on inline svg is unreliable. -->
                        <Tooltip v-if="references.prefixHasReferences(folder.prefix)">
                          <span class="shrink-0" tabindex="0">
                            <Link2 class="h-3 w-3 text-primary/40" aria-label="Contains referenced objects" />
                          </span>
                          <template #content>{{ prefixReferenceSummary(folder.prefix) }}</template>
                        </Tooltip>
                      </span>
                    </td>
                    <td class="px-4 py-2.5 text-right text-muted-foreground">-</td>
                    <td class="px-4 py-2.5 text-muted-foreground">-</td>
                    <td class="px-4 py-2.5">
                      <div class="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label="Delete folder" :disabled="!s3.canDeletePrefix(bucket, folder.prefix, remoteNodeId)" :title="s3.canDeletePrefix(bucket, folder.prefix, remoteNodeId) ? 'Delete folder' : 'This session cannot delete this entire folder'" @click.stop="openDeleteFolder(folder)"><Trash2 class="size-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                  <!-- Row click previews; the action buttons stop propagation. -->
                  <tr
                    v-for="object in objects"
                    :key="object.key"
                    class="cursor-pointer border-t border-border hover:bg-muted/30"
                    @click="openPreview(object)"
                  >
                    <td class="px-4 py-2.5">
                      <span class="flex items-center gap-2">
                        <ObjectIcon :name="object.name" class="h-4 w-4" /> <span class="truncate">{{ object.name }}</span>
                        <ArrowLeftRight
                          v-if="keyIsSynced(object.key)"
                          class="h-3 w-3 shrink-0 text-primary/40"
                          aria-label="Covered by a sync relationship"
                        />
                        <Tooltip v-if="references.keyIsReferenced(object.key)">
                          <span class="shrink-0" tabindex="0">
                            <Link2 class="h-3 w-3 text-primary/40" :aria-label="referencedFrom(object.key)" />
                          </span>
                          <template #content>{{ referencedFrom(object.key) }}</template>
                        </Tooltip>
                      </span>
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ object.size !== undefined ? formatBytes(object.size) : '-' }}</td>
                    <td class="px-4 py-2.5 text-xs text-muted-foreground">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '-' }}</td>
                    <td class="px-4 py-2.5">
                      <div class="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Preview" @click.stop="openPreview(object)"><Eye class="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Download" @click.stop="download(object)"><Download class="size-3.5" /></Button>
                        <Button
                          v-if="!remoteNodeId"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Storage locations"
                          title="Storage locations: where this file is stored"
                          @click.stop="locationsKey = object.key"
                        ><HardDrive class="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label="Delete" :disabled="!s3.canWrite(bucket, object.key, remoteNodeId)" :title="s3.canWrite(bucket, object.key, remoteNodeId) ? 'Delete object' : 'This session cannot delete this object'" @click.stop="openDeleteObject(object)"><Trash2 class="size-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="isEmpty">
                    <td colspan="4" class="px-4 py-10 text-center text-xs text-muted-foreground">
                      {{ canWriteCurrentPrefix ? 'This prefix is empty. Drop files here or use Add data.' : 'This prefix is empty. This session is read-only here.' }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="nextToken" class="border-t border-border px-4 py-2">
                <Button variant="ghost" size="sm" :disabled="listLoading" @click="loadObjects(true)">Load more</Button>
              </div>
            </div>

            <!-- Persistent drop target — same upload path and guards as the
                 toolbar Upload button. -->
            <button
              type="button"
              class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-xs transition-colors"
              :class="canWriteCurrentPrefix ? (stripDrag ? 'border-primary bg-primary/[0.06] text-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground') : 'cursor-not-allowed border-border text-muted-foreground opacity-60'"
              :disabled="!canWriteCurrentPrefix"
              :title="writeRestrictionMessage ?? 'Upload files'"
              @click="pickFiles"
              @dragover.prevent="stripDrag = true"
              @dragleave="stripDrag = false"
              @drop.prevent="onStripDrop"
            >
              <Upload class="h-4 w-4" />
              <span>{{ canWriteCurrentPrefix ? 'Drop files here to upload to' : 'Uploads are unavailable for' }} <span class="font-mono">{{ bucket }}/{{ s3Prefix }}</span></span>
            </button>
            <p v-if="uploadRestrictionError" class="mt-2 text-xs text-destructive">{{ uploadRestrictionError }}</p>
            </template>
          </template>
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

    <StagingJobsPanel v-if="stagingJobsEnabled" v-model:open="stagingPanelOpen" />

    <BucketRoutingDialog v-model:open="routingDialogOpen" :bucket="bucket" :group-id="activeGroupId" />

    <BucketPolicyDialog v-if="residencyPoliciesEnabled && isRealmAdmin && isManagementNode" v-model:open="residencyDialogOpen" :bucket="bucket" />

    <ObjectLocationsDialog
      :open="locationsKey !== null"
      :bucket="bucket"
      :object-key="locationsKey ?? ''"
      :group-id="activeGroupId"
      @update:open="(v: boolean) => { if (!v) locationsKey = null }"
    />

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

    <Dialog :open="newFolderOpen" @update:open="(v: boolean) => (newFolderOpen = v)">
      <DialogContent class="max-w-sm">
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
          <p v-if="newFolderError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ newFolderError }}</p>
        </div>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="newFolderInvalid || newFolderBusy || !s3.canWrite(bucket, `${s3Prefix}${newFolderName.trim()}/`, remoteNodeId)" @click="createFolder">{{ newFolderBusy ? 'Creating…' : 'Create' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(v: boolean) => { if (!v && !deleteBusy) deleteTarget = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ deleteTarget?.type === 'folder' ? 'Delete folder' : 'Delete object' }}</DialogTitle>
          <DialogDescription v-if="deleteTarget?.type === 'folder'">
             Deletes the folder <span class="font-mono text-xs">{{ deleteTarget.folder.name }}/</span> from
             <span class="font-mono text-xs">{{ deleteTarget.bucket }}</span>. ALL objects under it are permanently deleted.
          </DialogDescription>
          <DialogDescription v-else>
             Deletes <span class="font-mono text-xs">{{ deleteTarget?.object.key }}</span> from
             <span class="font-mono text-xs">{{ deleteTarget?.bucket }}</span>. A delete marker is written; earlier versions stay retrievable by version ID.
          </DialogDescription>
        </DialogHeader>
        <div v-if="deleteTarget?.type === 'folder'" class="space-y-2 text-xs">
          <p v-if="deleteTarget.count === null" class="flex items-center gap-2 text-muted-foreground">
            <Loader2 class="h-3 w-3 animate-spin" /> Counting objects…
          </p>
          <p v-else-if="deleteTarget.count >= 0" class="text-muted-foreground">
            Contains {{ deleteTarget.count }}{{ deleteTarget.countTruncated ? '+' : '' }} object{{ deleteTarget.count === 1 && !deleteTarget.countTruncated ? '' : 's' }}.
          </p>
          <p v-else class="text-muted-foreground">The object count could not be resolved.</p>
          <p
            v-if="references.prefixHasReferences(deleteTarget.folder.prefix) || keyIsSynced(deleteTarget.folder.prefix)"
            class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-800 dark:text-amber-300"
          >
            This folder includes referenced or synced content.
          </p>
        </div>
        <p v-if="deleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ deleteError }}</p>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline" :disabled="deleteBusy">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="deleteBusy || (deleteTarget?.type === 'object' ? !s3.canWrite(deleteTarget.bucket, deleteTarget.object.key, deleteTarget.nodeId) : deleteTarget?.type === 'folder' ? !s3.canDeletePrefix(deleteTarget.bucket, deleteTarget.folder.prefix, deleteTarget.nodeId) : true)" @click="confirmDelete">{{ deleteBusy ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="bucketDeleteTarget !== null"
      @update:open="(v: boolean) => { if (!v && !bucketDeleteBusy) { bucketDeleteTarget = null; bucketDeleteConfirm = '' } }"
    >
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete bucket</DialogTitle>
          <DialogDescription v-if="bucketDeleteTarget">
            Permanently deletes the bucket <span class="font-mono text-xs">{{ bucketDeleteTarget.bucket }}</span> and everything stored in it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div v-if="bucketDeleteTarget" class="space-y-3 text-xs">
          <p v-if="bucketDeleteTarget.count === null" class="flex items-center gap-2 text-muted-foreground">
            <Loader2 class="h-3 w-3 animate-spin" /> Checking bucket contents…
          </p>
          <p v-else-if="bucketDeleteTarget.count === 0" class="text-muted-foreground">This bucket is empty.</p>
          <div
            v-else-if="bucketDeleteTarget.count > 0"
            class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive"
          >
            Deletes {{ bucketDeleteTarget.count }}{{ bucketDeleteTarget.countTruncated ? '+' : '' }} object{{ bucketDeleteTarget.count === 1 && !bucketDeleteTarget.countTruncated ? '' : 's' }}<template v-if="bucketDeleteTarget.bytes > 0"> ({{ bucketDeleteTarget.countTruncated ? 'at least ' : '' }}{{ formatBytes(bucketDeleteTarget.bytes) }})</template>. All contents are removed before the bucket itself.
          </div>
          <p v-else class="text-muted-foreground">
            The contents could not be listed. Any objects present are removed before the bucket is deleted.
          </p>
          <div class="space-y-1">
            <label class="block text-muted-foreground">
              Type <span class="font-mono text-foreground">{{ bucketDeleteTarget.bucket }}</span> to confirm.
            </label>
            <Input
              v-model="bucketDeleteConfirm"
              class="font-mono text-xs"
              autocomplete="off"
              placeholder="bucket name"
              @keyup.enter="confirmDeleteBucket"
            />
          </div>
        </div>
        <p v-if="bucketDeleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ bucketDeleteError }}</p>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline" :disabled="bucketDeleteBusy">Cancel</Button></DialogClose>
          <Button
            variant="destructive"
            :disabled="!bucketDeleteConfirmed || bucketDeleteBusy || !s3.canDeletePrefix(bucketDeleteTarget?.bucket ?? '', '', bucketDeleteTarget?.nodeId ?? null)"
            @click="confirmDeleteBucket"
          >{{ bucketDeleteBusy ? 'Deleting…' : 'Delete bucket' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="precheck !== null" @update:open="(v: boolean) => { if (!v) precheck = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Storage quota warning</DialogTitle>
          <DialogDescription>
            This upload would push the group past its storage quota. The check is advisory, you can still upload.
          </DialogDescription>
        </DialogHeader>
        <div v-if="precheck" class="space-y-2 text-xs">
          <div
            v-if="precheck.projected.state === 'over-ceiling'"
            class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive"
          >
            This upload adds <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
            <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>. It would exceed the group's hard cap of
            <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>, the node rejects writes above the cap with <code>QuotaExceeded</code>.
          </div>
          <div
            v-else
            class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-800 dark:text-amber-300"
          >
            This upload adds <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
            <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>. It crosses the group quota of
            <strong>{{ formatBytes(precheck.projected.quotaBytes ?? 0) }}</strong> into the grace headroom. Uploads still succeed until the hard cap of
            <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>.
          </div>
          <p class="text-muted-foreground">Counters on remote nodes can lag, so these numbers are approximate.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="precheck = null">Cancel</Button>
          <Button @click="confirmPrecheckUpload">Upload anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
