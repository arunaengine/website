<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
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
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import StagingJobsPanel from '@/components/data/StagingJobsPanel.vue'
import SyncBucketDialog from '@/components/data/SyncBucketDialog.vue'
import SyncStatusPanel from '@/components/data/SyncStatusPanel.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import Progress from '@/components/ui/Progress.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useStaging } from '@/composables/useStaging'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { useUploadQueue } from '@/composables/useUploadQueue'
import { featureEnabled } from '@/lib/config'
import { useS3, s3ErrorMessage, isS3AuthError, isS3NetworkError, isS3QuotaError, type BucketEntry, type FolderEntry, type ObjectEntry, type S3Key, type UploadHandle } from '@/composables/useS3'
import { assessQuota, quotaCountedBytes, type QuotaAssessment } from '@/lib/quota'
import { isWorkspaceBucket } from '@/lib/workspaces'
import type { BucketSearchHit, SourceConnectorSummary, UsageResponse } from '@/lib/api'
import { referenceSourceLabel, referenceSourceName, type ReferenceSourceGroup } from '@/lib/references'
import { parseArunaArn, prefixesOverlap } from '@/lib/sync'
import { formatBytes, relativeTime } from '@/lib/utils'
import { dataWatchPathPrefix, s3EndpointNodeId } from '@/lib/watches'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftRight,
  Boxes,
  ChevronRight,
  CloudOff,
  Download,
  Eye,
  FolderPlus,
  History,
  KeyRound,
  Link2,
  Loader2,
  LogIn,
  Pin,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { authToken, currentUser, bootstrapped, credentials, getGroupUsage, listGroupConnectors, listSyncRelationships, nodeInfo, realmInfo } = useAruna()
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
// into remote buckets stay stable. S3 credentials are realm-wide, so the same
// stored key signs requests against the remote node's published S3 endpoint.
const realmNodes = useRealmNodes()
const shortcuts = useBucketShortcuts()

const remoteNodeId = computed(() => {
  const nodeId = routeString(route.query.node)
  if (!nodeId || realmNodes.isLocalNode(nodeId)) return null
  return nodeId
})
// The endpoint actually serving the browsed bucket (local or remote).
const effectiveEndpoint = computed(() => s3.endpointForNode(remoteNodeId.value))
// Remote node without a published S3 endpoint: honest info panel, never a
// broken view. CORS/unreachable failures flip remoteBrowseBlocked instead.
const remoteEndpointMissing = computed(() => Boolean(remoteNodeId.value) && !effectiveEndpoint.value)
const remoteBrowseBlocked = ref(false)
const remoteBlocked = computed(() => remoteEndpointMissing.value || remoteBrowseBlocked.value)

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
// Local bucket name → relationship summary, from ONE batched direction=both
// listing on bucket-list load (sidebar badges + row indicators).
const syncByBucket = ref<Map<string, BucketSyncInfo>>(new Map())
let syncOverviewRequestId = 0

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
      const info = map.get(parsed.bucket) ?? { outgoing: 0, incoming: 0, prefixes: [] }
      info[direction]++
      info.prefixes.push(parsed.prefix)
      map.set(parsed.bucket, info)
    }
    // The local side is the source of outgoing and the target of incoming rows.
    for (const relationship of response.outgoing) add(relationship.source, 'outgoing')
    for (const relationship of response.incoming) add(relationship.target, 'incoming')
    syncByBucket.value = map
  } catch {
    // Badges are a progressive enhancement: a transient failure keeps the
    // previous state instead of tearing the indicators down.
  }
}

const bucketSyncInfo = computed(() =>
  remoteNodeId.value ? null : (syncByBucket.value.get(bucket.value) ?? null),
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
  void loadSyncOverview()
}

// ── Reference visibility (flag-gated) ───────────────────────────────────────
// One /staging/references load per opened LOCAL bucket (staging references
// live on the connected node); remote browsing skips the listing entirely.
const references = useStagingReferences(
  bucket,
  computed(() => !remoteNodeId.value),
)
const referenceStats = computed(() => references.stats.value)
// Header chip: total referenced count + bytes for the browsed bucket, with a
// per-source popover breakdown. Hidden when the flag is off, the endpoint is
// unsupported, the bucket is remote, or nothing is referenced.
const showReferenceStats = computed(
  () =>
    references.enabled &&
    references.supported.value &&
    !remoteNodeId.value &&
    referenceStats.value.count > 0,
)

// Breakdown row label; connector names resolve lazily via connectorsById.
function referenceGroupLabel(group: ReferenceSourceGroup): string {
  return referenceSourceName(
    { kind: group.kind, originNodeId: group.originNodeId },
    { connectorName: connectorName(group.connectorId), nodeLabel: realmNodes.displayName },
  )
}

const buckets = ref<BucketEntry[]>([])
const bucketsLoading = ref(false)
const bucketsError = ref<string | null>(null)
const bucketsAuthError = ref(false)

// Per-run ws-<jobId> scratch buckets stay out of the main list; they live in a
// collapsed "System workspaces" group at the bottom of the sidebar. Deep links
// into a ws- bucket still open it (the route drives the listing), and the
// group auto-expands so the open bucket is visible in the sidebar.
const regularBuckets = computed(() => buckets.value.filter((entry) => !isWorkspaceBucket(entry.name)))
const workspaceBuckets = computed(() => buckets.value.filter((entry) => isWorkspaceBucket(entry.name)))
const workspacesOpen = ref(false)

const folders = ref<FolderEntry[]>([])
const objects = ref<ObjectEntry[]>([])
const nextToken = ref<string | undefined>(undefined)
const listLoading = ref(false)
const listError = ref<string | null>(null)
const listAuthError = ref(false)

const newBucketName = ref('')
const creatingBucket = ref(false)
const createBucketError = ref<string | null>(null)

const credentialDialogOpen = ref(false)
const manualKeyId = ref('')
const manualSecret = ref('')

const keyTail = computed(() => s3.activeKey.value?.accessKeyId.slice(-4) ?? '')

interface UploadItem {
  id: number
  name: string
  state: 'uploading' | 'done' | 'error' | 'canceled'
  progress: number
  error?: string
  quotaExceeded?: boolean
}
const uploads = ref<UploadItem[]>([])
const uploadHandles = new Map<number, UploadHandle>()
let uploadCounter = 0
let disposed = false
const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
const stripDrag = ref(false)

const addDataOpen = ref(false)
const staging = useStaging()
// Staging jobs side panel: config-gated (no job-listing endpoint on today's
// backend). The dialog's connector tab covers registered connectors regardless.
const stagingJobsEnabled = featureEnabled('stagingJobs')
const stagingPanelOpen = ref(false)

// Background uploads run through the persistent queue (Add data dialog); when
// one completes into the open bucket, refresh the listing.
const uploadQueue = useUploadQueue()
watch(uploadQueue.lastCompleted, (completed) => {
  // Queue uploads always target the connected node.
  if (completed && completed.bucket === bucket.value && !remoteNodeId.value) void loadObjects()
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

const deleteTarget = ref<{ bucket: string; object: ObjectEntry; nodeId: string | null } | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

const newFolderOpen = ref(false)
const newFolderName = ref('')
const newFolderBusy = ref(false)
const newFolderError = ref<string | null>(null)
const newFolderInvalid = computed(() => {
  const name = newFolderName.value.trim()
  return !name || name.includes('/')
})

let bucketRequestId = 0
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

async function refreshBuckets() {
  if (!s3.hasActiveKey.value || !s3.endpoint.value) return
  const requestId = ++bucketRequestId
  bucketsLoading.value = true
  bucketsError.value = null
  bucketsAuthError.value = false
  try {
    const entries = await s3.listBuckets()
    if (requestId !== bucketRequestId) return
    buckets.value = entries
  } catch (err) {
    if (requestId === bucketRequestId) {
      bucketsError.value = s3ErrorMessage(err)
      bucketsAuthError.value = isS3AuthError(err)
      buckets.value = []
    }
  } finally {
    if (requestId === bucketRequestId) bucketsLoading.value = false
  }
}

async function loadObjects(more = false) {
  if (!s3.hasActiveKey.value || !effectiveEndpoint.value || !bucket.value) return
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

function refreshAll() {
  void refreshBuckets()
  void loadSyncOverview()
  if (bucket.value) {
    void loadObjects()
    void references.reload()
  }
}

// On a fresh page load the S3 endpoint arrives asynchronously (from the
// /info bootstrap), so loading must wait for both the key and the endpoint
// and re-fire once the endpoint resolves.
watch(
  [() => s3.activeKey.value, () => s3.endpoint.value],
  ([key, endpoint]) => {
    ++bucketRequestId
    buckets.value = []
    bucketsLoading.value = false
    bucketsError.value = null
    bucketsAuthError.value = false
    clearObjectListing()
    abortActiveUploads()
    if (!key) return
    if (!endpoint) return
    refreshAll()
  },
  { immediate: true },
)

// effectiveEndpoint is included so a remote deep link starts listing once the
// realm document (with the remote node's published S3 URL) arrives.
watch([bucket, prefix, remoteNodeId, effectiveEndpoint], () => {
  clearObjectListing()
  if (bucket.value) void loadObjects()
})

// Auto-recent: every opened bucket lands in the sidebar shortcuts (last 5).
watch(
  [bucket, remoteNodeId],
  ([name]) => {
    if (name) shortcuts.recordRecent(name, remoteNodeId.value)
  },
  { immediate: true },
)

watch(
  bucket,
  (name) => {
    if (name && isWorkspaceBucket(name)) workspacesOpen.value = true
  },
  { immediate: true },
)

function activateManualKey() {
  if (!manualKeyId.value.trim() || !manualSecret.value.trim()) return
  s3.setActiveKey({ accessKeyId: manualKeyId.value.trim(), secretAccessKey: manualSecret.value.trim() })
  manualKeyId.value = ''
  manualSecret.value = ''
}

// Navigating to the current location must reload, not clear: a push to an
// identical route never fires the [bucket, prefix] watch, so a pre-cleared
// listing would stay empty (the "home shows an empty bucket" bug).
function openBucketOn(name: string, nodeId: string | null) {
  if (name === bucket.value && !prefix.value && nodeId === remoteNodeId.value) {
    void loadObjects()
    return
  }
  void router.push({
    name: 'bucket',
    params: { bucketId: name },
    query: nodeId ? { node: nodeId } : {},
  })
}

function openBucket(name: string) {
  openBucketOn(name, null)
}

function openSearchHit(hit: BucketSearchHit) {
  openBucketOn(hit.bucket, realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id)
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
    },
  })
}

function openFolder(folder: FolderEntry) {
  navigateTo(folder.prefix.replace(/\/$/, ''))
}

async function createBucket() {
  const name = newBucketName.value.trim()
  if (!name) return
  creatingBucket.value = true
  createBucketError.value = null
  try {
    await s3.createBucket(name)
    newBucketName.value = ''
    await refreshBuckets()
    openBucket(name)
  } catch (err) {
    createBucketError.value = s3ErrorMessage(err)
  } finally {
    creatingBucket.value = false
  }
}

function openNewFolder() {
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
  fileInput.value?.click()
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void requestUpload(Array.from(input.files))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  if (!bucket.value || !event.dataTransfer?.files.length) return
  void requestUpload(Array.from(event.dataTransfer.files))
}

function onStripDrop(event: DragEvent) {
  stripDrag.value = false
  if (!bucket.value || !event.dataTransfer?.files.length) return
  void requestUpload(Array.from(event.dataTransfer.files))
}

// The bucket namespace is the credential's group, so quota state for uploads
// comes from that group's usage endpoint. Manual keys not in the caller's
// credential list resolve to null -> the precheck silently skips (advisory).
const activeGroupId = computed(
  () => credentials.value.find((c) => c.access_key_id === s3.activeKey.value?.accessKeyId)?.group_id ?? null,
)

// Canonical data watch prefix for the browsed bucket/prefix. Needs the
// credential's group (manual keys outside the caller's credential list cannot
// resolve one) and the id of the node SERVING the S3 endpoint — uploads emit
// under that node, so watching the wrong node id would never fire.
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
  endpoint: string
  nodeId: string | null
  key: S3Key
  groupId: string | null
}

function captureUploadContext(files: File[]): UploadContext | null {
  const key = s3.activeKey.value
  const endpoint = effectiveEndpoint.value
  if (!key || !endpoint || !bucket.value) return null
  return {
    files,
    bucket: bucket.value,
    prefix: s3Prefix.value,
    endpoint,
    nodeId: remoteNodeId.value,
    key,
    groupId: activeGroupId.value,
  }
}

function sameS3Session(context: UploadContext): boolean {
  const key = s3.activeKey.value
  return Boolean(
    !disposed &&
      key &&
      s3.endpointForNode(context.nodeId) === context.endpoint &&
      key.accessKeyId === context.key.accessKeyId &&
      key.secretAccessKey === context.key.secretAccessKey,
  )
}

// Advisory only: this may warn but never blocks. Every path ends in an upload.
async function requestUpload(files: File[]) {
  const context = captureUploadContext(files)
  if (!context) return
  const groupId = context.groupId
  if (groupId) {
    const usage = await groupUsageFresh(groupId)
    if (!sameS3Session(context)) return
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
  await uploadFiles(context)
}

function confirmPrecheckUpload() {
  const context = precheck.value?.context ?? null
  precheck.value = null
  if (context) void uploadFiles(context)
}

async function uploadFiles(context: UploadContext) {
  for (const file of context.files) {
    if (!sameS3Session(context)) {
      listError.value = 'The active S3 credentials changed, so the remaining uploads were canceled.'
      break
    }
    const item: UploadItem = { id: ++uploadCounter, name: file.name, state: 'uploading', progress: 0 }
    uploads.value = [...uploads.value, item]
    const handle = s3.uploadObject(
      context.bucket,
      `${context.prefix}${file.name}`,
      file,
      (loaded, total) => {
        item.progress = total ? Math.round((loaded / total) * 100) : 0
        uploads.value = [...uploads.value]
      },
      context.nodeId,
    )
    uploadHandles.set(item.id, handle)
    try {
      await handle.promise
      item.state = 'done'
      item.progress = 100
    } catch (err) {
      if (item.state !== 'canceled') {
        item.state = 'error'
        if (isS3QuotaError(err)) {
          item.quotaExceeded = true
          item.error = 'The group’s storage quota is exhausted — the node rejected this upload (QuotaExceeded).'
        } else {
          item.error = s3ErrorMessage(err)
        }
      }
    } finally {
      uploadHandles.delete(item.id)
    }
    uploads.value = [...uploads.value]
  }
  if (context.bucket === bucket.value && context.prefix === s3Prefix.value && sameS3Session(context)) {
    await loadObjects()
  }
}

async function cancelUpload(item: UploadItem) {
  const handle = uploadHandles.get(item.id)
  if (!handle) return
  item.state = 'canceled'
  uploads.value = [...uploads.value]
  await handle.abort().catch(() => undefined)
}

function clearFinishedUploads() {
  uploads.value = uploads.value.filter((item) => item.state === 'uploading')
}

function abortActiveUploads() {
  for (const [id, handle] of uploadHandles) {
    const item = uploads.value.find((entry) => entry.id === id)
    if (item) item.state = 'canceled'
    void handle.abort().catch(() => undefined)
  }
  if (uploadHandles.size) uploads.value = [...uploads.value]
}

// A reload mid-upload silently discards the multipart upload, so ask the
// browser to confirm while one is running.
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!uploads.value.some((item) => item.state === 'uploading')) return
  event.preventDefault()
}
window.addEventListener('beforeunload', onBeforeUnload)
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('beforeunload', onBeforeUnload)
  abortActiveUploads()
})

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

const previewReference = computed(() =>
  previewObject.value
    ? (references.referencedByKey.value.get(previewObject.value.key) ?? null)
    : null,
)
const previewReferencedFrom = computed(() => {
  const entry = previewReference.value
  if (!entry) return null
  return referenceSourceLabel(entry, {
    connectorName: connectorName(entry.connector_id),
    nodeLabel: realmNodes.displayName,
  })
})
// HEAD fallback: flag on but no listing to consult — the endpoint is absent,
// or the bucket is remote (the connected node's listing does not cover it).
const previewProbeReference = computed(
  () => references.enabled && (remoteNodeId.value ? true : !references.supported.value),
)

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

async function confirmDelete() {
  if (!deleteTarget.value) return
  const target = deleteTarget.value
  deleteBusy.value = true
  deleteError.value = null
  try {
    await s3.deleteObject(target.bucket, target.object.key, target.nodeId)
    deleteTarget.value = null
    if (target.bucket === bucket.value) await loadObjects()
  } catch (err) {
    deleteError.value = s3ErrorMessage(err)
  } finally {
    deleteBusy.value = false
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
        <template v-if="s3.hasActiveKey.value">
          <span
            class="flex items-center gap-1 font-mono text-[11px] text-muted-foreground"
            :title="`Signing with key ${s3.activeKey.value?.accessKeyId} — manage keys in Settings`"
          >
            <KeyRound class="h-3 w-3" /> …{{ keyTail }}
          </span>
          <Button variant="outline" size="sm" @click="refreshAll"><RefreshCw class="h-4 w-4" /> Refresh</Button>
        </template>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section v-if="!s3.endpoint.value && !bootstrapped" class="surface flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" /> Connecting to the node…
      </section>

      <section v-else-if="!s3.endpoint.value" class="surface border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-900 dark:text-amber-200">
        <div class="flex items-start gap-3">
          <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
          <p>This node does not advertise an S3 endpoint, so the data manager cannot connect.</p>
        </div>
      </section>

      <section v-else-if="!s3.hasActiveKey.value" class="grid gap-4 md:grid-cols-2">
        <div class="surface p-6">
          <div class="flex items-center gap-2">
            <KeyRound class="h-4 w-4 text-primary" />
            <h2 class="font-display text-base font-semibold text-aruna-navy">Create S3 credentials</h2>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Mint a group-scoped key for this realm. The same key works in the browser and in any S3 client.
          </p>
          <div class="mt-4">
            <Button v-if="currentUser" @click="credentialDialogOpen = true"><Plus class="h-4 w-4" /> Create credentials</Button>
            <p v-else class="flex items-center gap-2 text-sm text-muted-foreground"><LogIn class="h-4 w-4" /> Sign in first to create credentials.</p>
          </div>
        </div>
        <div class="surface p-6">
          <div class="flex items-center gap-2">
            <Boxes class="h-4 w-4 text-primary" />
            <h2 class="font-display text-base font-semibold text-aruna-navy">Use an existing key</h2>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            The key is kept in this browser so the session survives reloads. Revoke keys under Settings.
          </p>
          <div class="mt-4 space-y-2">
            <Input v-model="manualKeyId" placeholder="Access key ID" class="font-mono text-xs" />
            <Input v-model="manualSecret" placeholder="Secret access key" type="password" class="font-mono text-xs" @keyup.enter="activateManualKey" />
            <Button variant="outline" :disabled="!manualKeyId.trim() || !manualSecret.trim()" @click="activateManualKey">Use key</Button>
          </div>
        </div>
      </section>

      <section v-else class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside class="space-y-3">
          <div class="surface p-3">
            <BucketSearchBox @open="openSearchHit" @sync="openSyncFromHit" />
          </div>

          <div
            v-if="shortcuts.pinned.value.length || shortcuts.recent.value.length"
            class="surface overflow-hidden"
          >
            <header class="border-b border-border px-4 py-2.5">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pinned &amp; recent</h2>
            </header>
            <ul class="max-h-56 overflow-y-auto py-1">
              <li
                v-for="entry in [...shortcuts.pinned.value.map((s) => ({ ...s, pinned: true })), ...shortcuts.recent.value.map((s) => ({ ...s, pinned: false }))]"
                :key="`${entry.nodeId ?? 'local'}/${entry.bucket}/${entry.pinned}`"
                class="group/shortcut flex items-center gap-1 pr-2"
              >
                <button
                  class="flex min-w-0 flex-1 items-center gap-2 px-4 py-1.5 text-left text-xs hover:bg-muted"
                  :class="entry.bucket === bucket && (entry.nodeId ?? null) === remoteNodeId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
                  @click="openBucketOn(entry.bucket, entry.nodeId ?? null)"
                >
                  <component :is="entry.pinned ? Pin : History" class="h-3.5 w-3.5 shrink-0" :class="entry.pinned ? 'text-primary' : 'text-muted-foreground'" />
                  <span class="truncate">{{ entry.bucket }}</span>
                  <Badge v-if="entry.nodeId" variant="outline" class="ml-auto shrink-0 text-[10px]" :title="entry.nodeId">
                    {{ realmNodes.displayName(entry.nodeId) }}
                  </Badge>
                </button>
                <button
                  type="button"
                  class="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                  :class="entry.pinned ? '' : 'opacity-0 transition-opacity group-hover/shortcut:opacity-100 focus-visible:opacity-100'"
                  :title="entry.pinned ? 'Unpin bucket' : 'Pin bucket'"
                  :aria-label="entry.pinned ? `Unpin ${entry.bucket}` : `Pin ${entry.bucket}`"
                  @click="shortcuts.togglePin(entry.bucket, entry.nodeId ?? null)"
                >
                  <Pin class="h-3 w-3" :fill="entry.pinned ? 'currentColor' : 'none'" />
                </button>
              </li>
            </ul>
          </div>

          <div class="surface overflow-hidden">
            <header class="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 class="text-sm font-semibold text-foreground">Buckets</h2>
              <Badge variant="outline">{{ regularBuckets.length }}</Badge>
            </header>
            <div v-if="bucketsLoading" class="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading buckets…
            </div>
            <div v-else-if="bucketsError && bucketsAuthError" class="m-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <p>Your S3 credentials were rejected — the key may be invalid, expired, or revoked.</p>
              <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">{{ bucketsError }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" @click="credentialDialogOpen = true"><Plus class="h-3.5 w-3.5" /> Create new credentials</Button>
                <Button variant="outline" size="sm" @click="s3.clearActiveKey()"><KeyRound class="h-3.5 w-3.5" /> Clear active key</Button>
              </div>
            </div>
            <p v-else-if="bucketsError" class="px-4 py-3 text-xs text-destructive">{{ bucketsError }}</p>
            <template v-else>
              <ul v-if="regularBuckets.length" class="max-h-[420px] overflow-y-auto py-1">
                <li v-for="entry in regularBuckets" :key="entry.name">
                  <button
                    class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                    :class="entry.name === bucket && !remoteNodeId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
                    @click="openBucket(entry.name)"
                  >
                    <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span class="truncate">{{ entry.name }}</span>
                    <ArrowLeftRight
                      v-if="syncByBucket.has(entry.name)"
                      class="ml-auto h-3 w-3 shrink-0 text-primary/60"
                      aria-label="Sync relationships configured"
                    />
                  </button>
                </li>
              </ul>
              <p v-else class="px-4 py-4 text-xs text-muted-foreground">No buckets in this group yet.</p>
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
                <Button variant="outline" size="sm" :disabled="creatingBucket || !newBucketName.trim()" @click="createBucket">
                  <FolderPlus class="h-4 w-4" />
                </Button>
              </div>
              <p v-if="createBucketError" class="text-xs text-destructive">{{ createBucketError }}</p>
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
                <WatchButton
                  v-if="watchPathPrefix"
                  :path-prefix="watchPathPrefix"
                  event-kind="data_uploaded"
                  :resource-label="`${bucket}/${s3Prefix}`"
                  size="sm"
                />
                <Button
                  v-if="showSyncButton"
                  variant="outline"
                  size="sm"
                  :title="remoteNodeId ? 'Sync this remote bucket to the connected node' : 'Replicate this bucket to another node'"
                  @click="openSyncDialog"
                >
                  <ArrowLeftRight class="h-4 w-4" /> Sync
                </Button>
                <Button
                  v-if="bucketSyncCount"
                  variant="outline"
                  size="sm"
                  :title="`${bucketSyncCount} sync relationship${bucketSyncCount === 1 ? '' : 's'} — open sync status`"
                  @click="syncPanelOpen = true"
                >
                  <ArrowLeftRight class="h-4 w-4 text-primary" />
                  <Badge variant="secondary" class="ml-1">{{ bucketSyncCount }}</Badge>
                </Button>
                <Popover v-if="showReferenceStats">
                  <Button
                    variant="outline"
                    size="sm"
                    :title="`${referenceStats.count} referenced object${referenceStats.count === 1 ? '' : 's'} · ${formatBytes(referenceStats.bytes)} — open per-source breakdown`"
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
                          class="flex items-center justify-between gap-3 text-xs"
                        >
                          <span class="min-w-0 truncate text-foreground" :title="referenceGroupLabel(group)">
                            {{ referenceGroupLabel(group) }}
                          </span>
                          <span class="shrink-0 font-mono text-muted-foreground">
                            {{ group.count }} · {{ formatBytes(group.bytes) }}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </template>
                </Popover>
                <Button v-if="!remoteBlocked" variant="outline" size="sm" @click="openNewFolder"><FolderPlus class="h-4 w-4" /> New folder</Button>
                <!-- Staging and the Add data pipeline always target the connected node. -->
                <Button v-if="stagingJobsEnabled && !remoteNodeId" variant="outline" size="sm" @click="stagingPanelOpen = true">
                  Staging
                  <Badge v-if="staging.runningCount.value" variant="secondary" class="ml-1">{{ staging.runningCount.value }}</Badge>
                </Button>
                <Button v-if="!remoteNodeId" size="sm" @click="addDataOpen = true"><Plus class="h-4 w-4" /> Add data</Button>
              </div>
            </div>

            <!-- Remote bucket whose endpoint the browser cannot use: an honest
                 info panel instead of a broken listing. -->
            <div v-if="remoteBlocked" class="surface p-8 text-center">
              <CloudOff class="mx-auto h-6 w-6 text-muted-foreground" />
              <p class="mt-3 text-sm font-medium text-foreground">
                Hosted on {{ realmNodes.displayName(remoteNodeId) }} — browsing is unavailable from this origin.
              </p>
              <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {{
                  remoteEndpointMissing
                    ? 'The node does not publish an S3 endpoint, so its objects cannot be listed here.'
                    : 'The node’s S3 endpoint did not answer this browser — it may be unreachable or not allow cross-origin browsing.'
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
            <div v-if="uploads.length" class="surface space-y-1 p-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploads</span>
                <Button variant="ghost" size="sm" @click="clearFinishedUploads">Clear finished</Button>
              </div>
              <div v-for="item in uploads" :key="item.id" class="flex items-center gap-2 text-xs">
                <Loader2 v-if="item.state === 'uploading'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
                <Badge v-else :variant="item.state === 'done' ? 'accent' : item.state === 'canceled' ? 'secondary' : 'destructive'" class="text-[10px] uppercase">{{ item.state }}</Badge>
                <span class="min-w-0 flex-none truncate font-mono" :class="item.state === 'uploading' ? 'max-w-[40%]' : ''">{{ item.name }}</span>
                <template v-if="item.state === 'uploading'">
                  <Progress :value="item.progress" :warn="101" :critical="101" class="h-1.5 flex-1" />
                  <span class="w-9 shrink-0 text-right font-mono text-muted-foreground">{{ item.progress }}%</span>
                  <Button variant="ghost" size="sm" class="h-6 shrink-0 px-2" @click="cancelUpload(item)">Cancel</Button>
                </template>
                <span v-if="item.error" class="truncate text-destructive">{{ item.error }}</span>
                <RouterLink
                  v-if="item.quotaExceeded"
                  :to="activeGroupId ? { name: 'groups', params: { id: activeGroupId }, hash: '#storage' } : { name: 'groups' }"
                  class="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  View group quota
                </RouterLink>
              </div>
            </div>

            <div
              class="surface overflow-hidden"
              :class="dragActive ? 'ring-2 ring-primary ring-offset-2' : ''"
              @dragover.prevent="dragActive = true"
              @dragleave="dragActive = false"
              @drop.prevent="onDrop"
            >
              <div v-if="listError && listAuthError" class="border-b border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                <p>Your S3 credentials were rejected — the key may be invalid, expired, or revoked.</p>
                <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">{{ listError }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" @click="credentialDialogOpen = true"><Plus class="h-3.5 w-3.5" /> Create new credentials</Button>
                  <Button variant="outline" size="sm" @click="s3.clearActiveKey()"><KeyRound class="h-3.5 w-3.5" /> Clear active key</Button>
                </div>
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
                        <span
                          v-if="references.prefixHasReferences(folder.prefix)"
                          class="shrink-0"
                          title="Contains objects referenced from an external source"
                        >
                          <Link2
                            class="h-3 w-3 text-primary/40"
                            aria-label="Contains objects referenced from an external source"
                          />
                        </span>
                      </span>
                    </td>
                    <td class="px-4 py-2.5 text-right text-muted-foreground">—</td>
                    <td class="px-4 py-2.5 text-muted-foreground">—</td>
                    <td class="px-4 py-2.5"></td>
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
                        <span
                          v-if="references.keyIsReferenced(object.key)"
                          class="shrink-0"
                          title="Referenced from an external source"
                        >
                          <Link2
                            class="h-3 w-3 text-primary/40"
                            aria-label="Referenced from an external source"
                          />
                        </span>
                      </span>
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ object.size !== undefined ? formatBytes(object.size) : '—' }}</td>
                    <td class="px-4 py-2.5 text-xs text-muted-foreground">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '—' }}</td>
                    <td class="px-4 py-2.5">
                      <div class="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Preview" @click.stop="openPreview(object)"><Eye class="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Download" @click.stop="download(object)"><Download class="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label="Delete" @click.stop="deleteTarget = { bucket, object, nodeId: remoteNodeId }; deleteError = null"><Trash2 class="size-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="isEmpty">
                    <td colspan="4" class="px-4 py-10 text-center text-xs text-muted-foreground">
                      This prefix is empty. Drop files here or use Upload.
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
              :class="stripDrag ? 'border-primary bg-primary/[0.06] text-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'"
              @click="pickFiles"
              @dragover.prevent="stripDrag = true"
              @dragleave="stripDrag = false"
              @drop.prevent="onStripDrop"
            >
              <Upload class="h-4 w-4" />
              <span>Drop files here to upload to <span class="font-mono">{{ bucket }}/{{ s3Prefix }}</span></span>
            </button>
            </template>
          </template>
        </div>
      </section>
    </div>

    <CreateCredentialDialog v-model:open="credentialDialogOpen" />

    <AddDataDialog
      v-model:open="addDataOpen"
      :bucket="bucket"
      :prefix="s3Prefix"
      :group-id="activeGroupId"
      @staged="() => { void loadObjects(); void references.reload() }"
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
      @changed="onSyncChanged"
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
          <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
          <Button :disabled="newFolderInvalid || newFolderBusy" @click="createFolder">{{ newFolderBusy ? 'Creating…' : 'Create' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(v: boolean) => { if (!v) deleteTarget = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete object</DialogTitle>
          <DialogDescription>
             Deletes <span class="font-mono text-xs">{{ deleteTarget?.object.key }}</span> from
             <span class="font-mono text-xs">{{ deleteTarget?.bucket }}</span>. A delete marker is written; earlier versions stay retrievable by version ID.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ deleteError }}</p>
        <DialogFooter>
          <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="deleteBusy" @click="confirmDelete">{{ deleteBusy ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="precheck !== null" @update:open="(v: boolean) => { if (!v) precheck = null }">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Storage quota warning</DialogTitle>
          <DialogDescription>
            This upload would push the group past its storage quota. The check is advisory — you can still upload.
          </DialogDescription>
        </DialogHeader>
        <div v-if="precheck" class="space-y-2 text-xs">
          <div
            v-if="precheck.projected.state === 'over-ceiling'"
            class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive"
          >
            This upload adds <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
            <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>. It would exceed the group's hard cap of
            <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong> — the node rejects writes above the cap with <code>QuotaExceeded</code>.
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
