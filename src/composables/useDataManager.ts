// Shared state of the Data manager: the browsed bucket and prefix, the S3
// session context, the object listing with its selection, the bucket sidebar
// sources and the upload entry point. The view and its panels read this one
// instance instead of passing the same values down as props.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { contextKey, shouldOpenContext } from './s3/context'
import { useAruna } from './useAruna'
import { useBrowserSelection } from './useBrowserSelection'
import { useBuckets } from './useBuckets'
import { useBucketShortcuts, type BucketShortcut } from './useBucketShortcuts'
import { useGroupContext } from './useGroupSelection'
import { useListPages } from './useListPages'
import type { SyncRow } from './useBucketSyncs'
import { usePublicAccess } from './usePublicAccess'
import { useRealmNodes } from './useRealmNodes'
import { useRefresh } from './useRefresh'
import { useStagingReferences } from './useStagingReferences'
import { useSyncedFolders } from './useSyncedFolders'
import { useUploadQueue } from './useUploadQueue'
import {
  useS3,
  s3ErrorMessage,
  isS3AuthError,
  isS3BucketMissingError,
  isS3NetworkError,
  type FolderEntry,
  type ObjectEntry,
} from './useS3'
import { bucketNameProblem } from '@/lib/bucketName'
import { readStored, storeValue } from './aruna/state'
import { requestScope, type DeleteRequest, type DeletionResult } from '@/lib/deletion/request'
import type { DeletedObjectEntry } from '@/lib/objectVersions'
import { deletedOnPage, lastListedKey, shownDeleted, shownEntries, type ListingShow } from '@/lib/objectListing'
import { assessQuota, quotaCountedBytes, type QuotaAssessment } from '@/lib/quota'
import { isHiddenBucket, isWorkspaceBucket } from '@/lib/workspaces'
import { useAllBuckets } from './useAllBuckets'
import type { BucketSearchHit, SourceConnectorSummary, SyncRelationship, UsageResponse } from '@/lib/api'
import { referenceSourceLabel, referenceSourceName, type ReferenceSourceGroup } from '@/lib/references'
import { bindSource, type BindSource } from '@/lib/bindSource'
import { isDesktop } from '@/lib/desktop'
import type { SyncedFolder } from '@/lib/deviceApi'
import { parseArunaArn, prefixesOverlap, syncBucketKey } from '@/lib/sync'
import { dataWatchPathPrefix, s3EndpointNodeId } from '@/lib/watches'

interface BucketSyncInfo {
  outgoing: number
  incoming: number
  /** Local-side key prefixes ('' = whole bucket) for row indicators. */
  prefixes: string[]
}

// ONE flat sidebar list: pinned buckets first (any node, remote entries carry
// a node annotation), then every local bucket that is not already pinned.
interface SidebarBucketEntry {
  bucket: string
  /** Hosting node; null = the connected node. */
  nodeId: string | null
  pinned: boolean
}

interface UploadContext {
  files: File[]
  bucket: string
  prefix: string
  nodeId: string | null
  groupId: string | null
}

function routeString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

/**
 * Everything the browser waits for, in one condition: opening a group and
 * switching between groups paint once instead of filling in panel by panel.
 * A blocked remote node has nothing left to wait for and shows its own panel;
 * a failed bucket list has settled too and reports itself in the sidebar.
 */
export function dataViewReady(state: {
  contextReady: boolean
  remoteBlocked: boolean
  bucketsLoaded: boolean
  bucketsFailed: boolean
  bucket: string
  listLoading: boolean
  /** A listing of this bucket has finished, even an empty one. */
  listedOnce: boolean
}): boolean {
  if (!state.contextReady) return false
  if (state.remoteBlocked) return true
  // Only the first page blocks: paging must not take the listing off screen.
  const listingPending = Boolean(state.bucket) && state.listLoading && !state.listedOnce
  return (state.bucketsLoaded || state.bucketsFailed) && !listingPending
}

const LAST_BUCKET_KEY = 'aruna.lastBucket'

/** The bucket a connection and account last had open. */
export interface LastBucket {
  bucket: string
  /** Hosting node; null = the connected node. */
  nodeId: string | null
  groupId: string | null
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function lastBucketStore(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readStored(LAST_BUCKET_KEY) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

/** The remembered bucket of one scope; anything unreadable reads as none. */
export function readLastBucket(scope: string): LastBucket | null {
  const entry = lastBucketStore()[scope]
  if (!entry || typeof entry !== 'object') return null
  const fields = entry as Record<string, unknown>
  const bucket = optionalString(fields.bucket)
  if (!bucket) return null
  return { bucket, nodeId: optionalString(fields.nodeId), groupId: optionalString(fields.groupId) }
}

/** Records (or, with null, forgets) the bucket of one scope. */
export function writeLastBucket(scope: string, entry: LastBucket | null) {
  const store = lastBucketStore()
  if (entry) store[scope] = entry
  else delete store[scope]
  storeValue(LAST_BUCKET_KEY, Object.keys(store).length ? JSON.stringify(store) : '')
}

/** The scope a remembered bucket belongs to; none until the account is known. */
export function stickyScopeFor(apiBaseUrl: string, userId: string | undefined): string | null {
  return userId ? `${apiBaseUrl}|${userId}` : null
}

export type StickyBucketStep =
  | { action: 'wait' }
  | { action: 'forget' }
  | { action: 'open'; route: { name: string; params: { bucketId: string }; query: LocationQueryRaw } }

/**
 * What the bucket-less Data route should do with the remembered bucket: wait
 * while the list is still loading, open it when this group still has it, and
 * forget it otherwise so a stale name never keeps the picker away.
 */
export function stickyBucketStep(state: {
  memory: LastBucket | null
  groupId: string
  buckets: string[]
  bucketsLoaded: boolean
}): StickyBucketStep {
  const { memory } = state
  if (!memory) return { action: 'wait' }
  if (!state.bucketsLoaded) return { action: 'wait' }
  if (memory.groupId && state.groupId && memory.groupId !== state.groupId) return { action: 'forget' }
  if (memory.nodeId || !state.buckets.includes(memory.bucket)) return { action: 'forget' }
  return {
    action: 'open',
    route: {
      name: 'bucket',
      params: { bucketId: memory.bucket },
      query: state.groupId ? { group: state.groupId } : {},
    },
  }
}

/**
 * Where a group switch must go: the open bucket belongs to the old group, so
 * the bucket-less route (the picker) opens for the new one. Null keeps the route.
 */
export function groupSwitchRoute(state: {
  previous: string
  next: string
  bucket: string
  remoteNodeId: string | null
  queryGroup: string
  notebooks: boolean
}): { name: string; query: LocationQueryRaw } | null {
  const { previous, next, bucket, remoteNodeId, queryGroup } = state
  if (!previous || !next || previous === next || !bucket || remoteNodeId || queryGroup === next) return null
  return { name: 'buckets', query: { group: next, ...(state.notebooks ? { notebooks: '1' } : {}) } }
}

/**
 * Runs route changes one after another, so a later step reads the route an
 * earlier one produced instead of cancelling it.
 */
export function navigationQueue() {
  let last: Promise<unknown> = Promise.resolve()
  return (step: () => unknown): Promise<unknown> => {
    last = last.then(step, step)
    return last
  }
}

// The local "Recently browsed" rows the loaded list does not confirm: each is
// deleted or owned by another group, and only the node can tell them apart.
export function unlistedRecents(recent: BucketShortcut[], buckets: string[]): BucketShortcut[] {
  const listed = new Set(buckets)
  return recent.filter((entry) => !entry.nodeId && !listed.has(entry.bucket))
}

export function useDataManager() {
  const route = useRoute()
  const router = useRouter()
  const {
    apiBaseUrl,
    authToken,
    currentUser,
    myGroups,
    getGroupUsage,
    listGroupConnectors,
    listSyncRelationships,
    nodeInfo,
    realmInfo,
  } = useAruna()
  const s3 = useS3()

  const bucket = computed(() => routeString(route.params.bucketId))
  const prefix = computed(() => routeString(route.query.prefix))
  const s3Prefix = computed(() => (prefix.value ? `${prefix.value}/` : ''))

  // Federated bucket search + cross-node browsing. The optional ?node=<id> route
  // param selects the hosting node (default: the connected node) so deep links
  // into remote buckets stay stable. The temporary session for the selected
  // group and node is opened automatically and kept in memory only.
  const realmNodes = useRealmNodes()
  const shortcuts = useBucketShortcuts()
  // Same scoping as the shortcut store: another API base or account never
  // inherits this one's remembered bucket.
  const stickyScope = computed(() => stickyScopeFor(apiBaseUrl.value, currentUser.value?.id))

  const remoteNodeId = computed(() => {
    const nodeId = routeString(route.query.node)
    if (!nodeId || realmNodes.isLocalNode(nodeId)) return null
    return nodeId
  })
  const selectedGroupId = ref(routeString(route.query.group) || s3.activeContext.value?.groupId || '')
  const { groupsLoading, hasGroups } = useGroupContext(selectedGroupId)
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
  // A search hit may browse a group the user is not a member of, so the label
  // falls back to the name the hit carried.
  const selectedGroupName = computed(
    () =>
      myGroups.value.find((group) => group.id === selectedGroupId.value)?.name ||
      selectedGroupLabel.value ||
      selectedGroupId.value ||
      'No group',
  )
  const requiredNodeName = computed(() =>
    requiredNodeId.value ? realmNodes.displayName(requiredNodeId.value) : 'the selected node',
  )
  const issuerNodeName = computed(() =>
    contextMismatch.value ? realmNodes.displayName(contextMismatch.value.issuerNodeId) : '',
  )
  const keyTail = computed(() => s3.activeKey.value?.accessKeyId.slice(-4) ?? '')

  watch(selectedGroupId, () => {
    contextError.value = null
    uploadRestrictionError.value = null
  })

  // The (group, node) pair of the last attempt that did not end in a ready
  // session; only the view's Retry button opens it again.
  let failedContextKey: string | null = null
  // An open dialog browsing another node or group drives the session meanwhile.
  const contextHold = ref(false)
  // A group switch and the session's group query must not cancel each other.
  const navigate = navigationQueue()

  async function openSelectedContext() {
    if (!selectedGroupId.value || !requiredNodeId.value || contextBusy.value) return
    const key = contextKey(requiredNodeId.value, selectedGroupId.value)
    contextBusy.value = true
    contextError.value = null
    try {
      await s3.activateContext(remoteNodeId.value, selectedGroupId.value)
      await navigate(() => {
        if (routeString(route.query.group) === selectedGroupId.value) return
        return router.replace({ query: { ...route.query, group: selectedGroupId.value } })
      })
    } catch (err) {
      contextError.value = s3ErrorMessage(err)
    } finally {
      contextBusy.value = false
      failedContextKey = contextReady.value ? null : key
    }
  }

  // First load, a switched group and a deep link to another node all open their
  // session here; no button stands between the selection and the buckets.
  watch(
    [selectedGroupId, requiredNodeId, currentUser, contextReady, contextBusy, contextHold],
    () => {
      if (contextHold.value) return
      const open = shouldOpenContext({
        signedIn: Boolean(currentUser.value),
        groupId: selectedGroupId.value,
        nodeId: requiredNodeId.value,
        ready: contextReady.value,
        busy: contextBusy.value,
        failedKey: failedContextKey,
      })
      if (open) void openSelectedContext()
    },
    { immediate: true },
  )
  // The endpoint actually serving the browsed bucket (local or remote).
  const effectiveEndpoint = computed(() => s3.endpointForNode(remoteNodeId.value))
  // Remote node without a published S3 endpoint: honest info panel, never a
  // broken view. CORS/unreachable failures flip remoteBrowseBlocked instead.
  const remoteEndpointMissing = computed(() => Boolean(remoteNodeId.value) && !effectiveEndpoint.value)
  const remoteBrowseBlocked = ref(false)
  const remoteBlocked = computed(() => remoteEndpointMissing.value || remoteBrowseBlocked.value)

  // ── Bucket sync ───────────────────────────────────────────────────────────
  // (nodeId, bucket) → relationship summary, from ONE batched direction=both
  // listing on bucket-list load (sidebar badges + row indicators). BOTH sides
  // of every relationship register, so remote buckets browsed here surface the
  // sync info the connected node's listing already carries.
  const syncByBucket = ref<Map<string, BucketSyncInfo>>(new Map())
  const syncRelationships = ref<SyncRelationship[]>([])
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
      const unique: SyncRelationship[] = []
      for (const relationship of [...response.outgoing, ...response.incoming]) {
        if (seen.has(relationship.id)) continue
        seen.add(relationship.id)
        unique.push(relationship)
        add(relationship.source, 'outgoing')
        add(relationship.target, 'incoming')
      }
      syncRelationships.value = unique
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

  // The relationships behind a row's sync arrow: this bucket's side covers the key.
  function syncsForKey(key: string): SyncRow[] {
    const current = syncKeyFor(remoteNodeId.value, bucket.value)
    const covers = (arn: string) => {
      const parsed = parseArunaArn(arn)
      return Boolean(
        parsed &&
          syncKeyFor(parsed.nodeId, parsed.bucket) === current &&
          prefixesOverlap(key, parsed.prefix),
      )
    }
    return syncRelationships.value.flatMap((relationship) => [
      ...(covers(relationship.source) ? [{ relationship, direction: 'outgoing' as const }] : []),
      ...(covers(relationship.target) ? [{ relationship, direction: 'incoming' as const }] : []),
    ])
  }

  // The desktop binds a bucket to a folder only from a realm node, by explicit ids.
  function bindSourceFor(name: string, nodeId: string | null, groupId: string | null | undefined): BindSource | null {
    return bindSource(realmNodes.nodes.value, name, nodeId ?? realmNodes.localNodeId.value, groupId)
  }

  // Desktop only: the folder on this computer linked to each bucket, keyed like the syncs.
  const syncedFolders = isDesktop() ? useSyncedFolders() : null
  void syncedFolders?.ensureLoaded()
  const linkedFolders = computed(() => {
    const map = new Map<string, SyncedFolder>()
    for (const folder of syncedFolders?.folders.value ?? []) {
      const { node_id: nodeId, bucket: name } = folder.remote
      const key = syncKeyFor(nodeId, name)
      if (nodeId && name && !map.has(key)) map.set(key, folder)
    }
    return map
  })

  function linkedFolderFor(nodeId: string | null | undefined, name: string): SyncedFolder | null {
    return linkedFolders.value.get(syncKeyFor(nodeId, name)) ?? null
  }

  const currentLinkedFolder = computed(() => (bucket.value ? linkedFolderFor(remoteNodeId.value, bucket.value) : null))

  const showSyncButton = computed(
    () => Boolean(bucket.value) && !isWorkspaceBucket(bucket.value) && Boolean(authToken.value),
  )

  // ── Reference visibility ──────────────────────────────────────────────────
  // One /data/staging/references load per opened LOCAL bucket (staging references
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
  const regularBuckets = computed(() => buckets.value.filter((entry) => !isHiddenBucket(entry.name)))
  const workspaceBuckets = computed(() => buckets.value.filter((entry) => isWorkspaceBucket(entry.name)))
  const workspacesOpen = ref(false)

  const sidebarBuckets = computed<SidebarBucketEntry[]>(() => {
    const pinned = shortcuts.pinned.value.map((entry) => ({
      bucket: entry.bucket,
      nodeId: entry.nodeId ?? null,
      pinned: true,
    }))
    // The listed buckets live on the node of the open session.
    const nodeId = remoteNodeId.value
    const pinnedLocal = new Set(pinned.filter((entry) => entry.nodeId === nodeId).map((entry) => entry.bucket))
    const locals = regularBuckets.value
      .filter((entry) => !pinnedLocal.has(entry.name))
      .map((entry) => ({ bucket: entry.name, nodeId, pinned: false }))
    return [...pinned, ...locals]
  })

  // Buckets of another group are not reachable with this group's S3 session.
  const groupRecents = computed(() =>
    shortcuts.recent.value.filter((entry) => (entry.groupId ?? '') === selectedGroupId.value),
  )

  // "Recently browsed" only surfaces targets the list above does not already
  // show (pins are filtered in the store, listed local buckets here), so the
  // section stays non-redundant; in practice it holds remote buckets opened
  // via search without pinning them.
  // Node choice of the bucket list, kept here so it outlives the sidebar.
  // Null lists every node through the bucket search.
  const bucketNodeChoice = ref<string | null>(null)
  const bucketNameFilter = ref('')
  const allBuckets = useAllBuckets(
    bucketNameFilter,
    selectedGroupId,
    computed(() => bucketNodeChoice.value === null),
  )
  const recentNodes = computed(() => [
    ...new Set(shortcuts.recent.value.map((entry) => entry.nodeId).filter((id): id is string => Boolean(id))),
  ])
  // Opening a bucket on another node moves a one-node list along.
  watch(requiredNodeId, (nodeId) => {
    if (bucketNodeChoice.value !== null) bucketNodeChoice.value = nodeId
  })

  const recentBuckets = computed(() => {
    const visible = new Set(
      sidebarBuckets.value.map((entry) => `${entry.nodeId ?? ''}/${entry.bucket}`),
    )
    return groupRecents.value.filter(
      (entry) => !visible.has(`${entry.nodeId ?? ''}/${entry.bucket}`),
    )
  })

  // A deleted bucket would otherwise sit in "Recently browsed" until it is
  // opened: every loaded list asks the node about the local rows it lacks and
  // drops the ones that are gone. A row of another group stays.
  let recentCheckId = 0
  watch([bucketsLoaded, buckets], async ([loaded]) => {
    if (!loaded) return
    const id = ++recentCheckId
    for (const entry of unlistedRecents(groupRecents.value, buckets.value.map((item) => item.name))) {
      try {
        await s3.headBucket(entry.bucket)
      } catch (err) {
        if (id === recentCheckId && isS3BucketMissingError(err)) shortcuts.remove(entry.bucket, null)
      }
    }
  }, { immediate: true })

  const folders = ref<FolderEntry[]>([])
  const objects = ref<ObjectEntry[]>([])
  const pages = useListPages()
  const nextToken = pages.nextToken
  const listLoading = ref(false)
  const listError = ref<string | null>(null)
  const listAuthError = ref(false)
  // The name filter is an S3 prefix inside the open folder; the kind filter
  // only hides rows of the page already listed.
  const nameFilter = ref('')
  const listShow = ref<ListingShow>('all')
  const shown = computed(() => shownEntries(folders.value, objects.value, listShow.value))
  const visibleFolders = computed(() => shown.value.folders)
  const visibleObjects = computed(() => shown.value.objects)
  const selection = useBrowserSelection({
    folders: visibleFolders,
    objects: visibleObjects,
    canSelectObject: (key) => s3.canWrite(bucket.value, key, remoteNodeId.value),
    canSelectFolder: (prefix) => s3.canDeletePrefix(bucket.value, prefix, remoteNodeId.value),
  })
  const {
    selectedObjectKeys,
    selectedPrefixes,
    selectedCount,
    selectableListedCount,
    allListedSelected,
    someListedSelected,
    setObjectSelected,
    setFolderSelected,
    setAllListedSelected,
  } = selection

  // ListObjectsV2 hides a key whose head is a delete marker, so the toggle
  // lists them through ListObjectVersions and offers them back. The choice is
  // this viewer's alone and survives a reload.
  const SHOW_DELETED_KEY = 'aruna.data.showDeleted'
  const showDeleted = ref(readStored(SHOW_DELETED_KEY) === '1')
  const deletedObjects = ref<DeletedObjectEntry[]>([])
  const deletedLoading = ref(false)
  const deletedTruncated = ref(false)
  const deletedError = ref<string | null>(null)
  const restoringKey = ref<string | null>(null)
  let deletedRequestId = 0

  function setShowDeleted(next: boolean) {
    showDeleted.value = next
    storeValue(SHOW_DELETED_KEY, next ? '1' : '')
  }

  async function loadDeleted() {
    const id = ++deletedRequestId
    deletedError.value = null
    if (!showDeleted.value || remoteNodeId.value || !bucket.value || !contextReady.value) {
      deletedObjects.value = []
      deletedTruncated.value = false
      return
    }
    deletedLoading.value = true
    try {
      const page = await s3.listDeletedObjects(bucket.value, s3Prefix.value, remoteNodeId.value)
      if (id !== deletedRequestId) return
      deletedObjects.value = page.deleted
      deletedTruncated.value = page.truncated
    } catch (err) {
      if (id !== deletedRequestId) return
      deletedObjects.value = []
      deletedError.value = s3ErrorMessage(err)
    } finally {
      if (id === deletedRequestId) deletedLoading.value = false
    }
  }

  watch(
    [bucket, s3Prefix, remoteNodeId, showDeleted, contextReady],
    () => {
      void loadDeleted()
    },
    { immediate: true },
  )

  const deletedRows = computed(() => {
    if (!showDeleted.value) return []
    const shown = shownDeleted(deletedObjects.value, nameFilter.value, listShow.value)
    const through = nextToken.value ? lastListedKey(listedKeyList()) : undefined
    return deletedOnPage(shown, pages.previousLastKey.value, through)
  })

  // Hidden rows leave the selection, so no action reaches what is not shown.
  watch(listShow, () => selection.clearSelection())

  function resetFilters() {
    listShow.value = 'all'
    setShowDeleted(false)
  }

  // Deleting the delete marker moves the head back to the newest stored
  // version: the restore is one call and needs no confirmation.
  async function restoreObject(entry: DeletedObjectEntry) {
    if (!s3.canWrite(bucket.value, entry.key, remoteNodeId.value)) return
    restoringKey.value = entry.key
    deletedError.value = null
    try {
      await s3.deleteObjectVersion(
        bucket.value,
        entry.key,
        entry.markerVersionId,
        remoteNodeId.value,
      )
      await Promise.all([loadObjects(), loadDeleted()])
    } catch (err) {
      deletedError.value = s3ErrorMessage(err)
    } finally {
      restoringKey.value = null
    }
  }

  const newBucketName = ref('')
  const creatingBucket = ref(false)
  const createBucketError = ref<string | null>(null)
  // The rule the typed name breaks, and the session's own refusal, both shown
  // under the input so the disabled button always states why.
  const newBucketProblem = computed(() => {
    const name = newBucketName.value.trim()
    return name ? bucketNameProblem(name) : null
  })
  const newBucketRefusal = computed(() => {
    const name = newBucketName.value.trim()
    if (!name || newBucketProblem.value) return null
    return s3.canWrite(name, undefined, remoteNodeId.value)
      ? null
      : 'This session does not allow creating that bucket.'
  })
  const createBucketBlocker = computed(() => newBucketProblem.value ?? newBucketRefusal.value)

  const uploadRestrictionError = ref<string | null>(null)

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

  let listRequestId = 0
  const listedOnce = ref(false)

  // Deletion dialogs drop their target and pending preflight when the listing
  // they were opened from is replaced.
  const listingResetListeners: Array<() => void> = []
  function onListingReset(listener: () => void) {
    listingResetListeners.push(listener)
  }

  function clearObjectListing() {
    ++listRequestId
    listedOnce.value = false
    folders.value = []
    objects.value = []
    pages.reset()
    listLoading.value = false
    listError.value = null
    listAuthError.value = false
    remoteBrowseBlocked.value = false
    selection.clearSelection()
    for (const listener of listingResetListeners) listener()
  }


  // One page at a time: the page replaces the list, and Prev or Next pick it.
  async function loadObjects() {
    if (!contextReady.value || !effectiveEndpoint.value || !bucket.value) return
    if (!s3.canRead(bucket.value, s3Prefix.value, remoteNodeId.value)) {
      listError.value = 'This session does not allow reading the selected bucket and prefix.'
      return
    }
    const requestId = ++listRequestId
    const targetBucket = bucket.value
    const targetPrefix = s3Prefix.value
    const targetNode = remoteNodeId.value
    const continuation = pages.token.value
    const nameStart = nameFilter.value
    const maxKeys = pages.pageSize.value
    listLoading.value = true
    listError.value = null
    listAuthError.value = false
    remoteBrowseBlocked.value = false
    try {
      const page = await s3.listObjects(targetBucket, targetPrefix, continuation, targetNode, { nameStart, maxKeys })
      if (requestId !== listRequestId) return
      folders.value = page.folders
      objects.value = page.objects
      nextToken.value = page.nextToken
      selection.keepListed()
    } catch (err) {
      if (requestId === listRequestId) {
        // A remote endpoint the browser cannot reach (CORS rejection or the node
        // being down) degrades to the hosted-elsewhere panel, never a raw error.
        if (targetNode && isS3NetworkError(err)) {
          remoteBrowseBlocked.value = true
        } else {
          listError.value = s3ErrorMessage(err)
          listAuthError.value = isS3AuthError(err)
          if (isS3BucketMissingError(err)) shortcuts.remove(targetBucket, targetNode)
        }
      }
    } finally {
      if (requestId === listRequestId) {
        listLoading.value = false
        listedOnce.value = true
      }
    }
  }

  function turnPage(moved: boolean) {
    if (!moved) return
    selection.clearSelection()
    void loadObjects()
  }

  function listedKeyList(): string[] {
    return [...folders.value.map((folder) => folder.prefix), ...objects.value.map((object) => object.key)]
  }
  const nextPage = () => turnPage(pages.next(lastListedKey(listedKeyList())))
  const previousPage = () => turnPage(pages.previous())
  function setPageSize(size: number) {
    pages.setPageSize(size)
    turnPage(true)
  }

  // Everything except the bucket list, which has its own cache-aware entry points.
  function reloadContext(): Promise<unknown> {
    const work: Array<Promise<unknown>> = [loadSyncOverview()]
    if (bucket.value) work.push(loadObjects(), references.reload())
    return Promise.all(work)
  }

  // Refresh checks the open bucket and reloads only the first page of its list.
  async function refreshBucket() {
    const target = bucket.value
    const node = remoteNodeId.value
    try {
      await s3.headBucket(target, node)
    } catch (err) {
      if (isS3BucketMissingError(err) && target === bucket.value && node === remoteNodeId.value) {
        clearObjectListing()
        listError.value = s3ErrorMessage(err)
        shortcuts.remove(target, node)
        return
      }
    }
    pages.reset()
    await loadObjects()
  }

  // Without an open bucket, only the shown bucket list reloads.
  function refreshAll(): Promise<unknown> {
    if (bucket.value) return refreshBucket()
    return bucketNodeChoice.value === null ? allBuckets.reload() : bucketList.refresh()
  }

  const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refreshAll)
  const refreshSpinning = computed(() => refreshBusy.value || bucketsRefreshing.value)
  const { busy: retryBusy, refresh: onRetryObjects } = useRefresh(() => loadObjects())
  const retrySpinning = computed(() => retryBusy.value || listLoading.value)

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
  // A new folder starts unfiltered; the sync flush lets one listing cover both changes.
  watch([bucket, prefix], () => (nameFilter.value = ''), { flush: 'sync' })
  // A name filter alone keeps the shown list until the new page arrives.
  watch([bucket, prefix, remoteNodeId, effectiveEndpoint, nameFilter], (next, previous) => {
    if (next.slice(0, 4).some((value, index) => value !== previous[index])) clearObjectListing()
    else pages.reset()
    if (bucket.value && contextReady.value) void loadObjects()
  })

  watch(
    () => route.query.group,
    (group) => {
      const next = routeString(group)
      if (next) selectedGroupId.value = next
    },
  )

  // A search hit sets the group and opens its own bucket, so it is not a switch.
  let hitGroupId = ''
  // The open bucket belongs to the old group: show the picker for the new one.
  watch(selectedGroupId, (next, previous) => {
    if (next === hitGroupId) {
      hitGroupId = ''
      return
    }
    const target = groupSwitchRoute({
      previous,
      next,
      bucket: bucket.value,
      remoteNodeId: remoteNodeId.value,
      queryGroup: routeString(route.query.group),
      notebooks: route.name === 'notebooks' || route.query.notebooks === '1',
    })
    if (target) void navigate(() => router.replace(target))
  })

  watch(
    bucket,
    (name) => {
      if (name && isWorkspaceBucket(name)) workspacesOpen.value = true
    },
    { immediate: true },
  )

  // Every opened bucket (sidebar click, search hit, or deep link) lands in
  // "Recently browsed"; the shortcut store drops ws- scratch buckets itself.
  // The same bucket is remembered per connection and account so returning to
  // the Data view reopens it instead of asking for a bucket again.
  watch(
    [bucket, remoteNodeId, stickyScope],
    ([name, nodeId]) => {
      if (!name) return
      shortcuts.recordRecent(name, nodeId, selectedGroupId.value || null)
      const scope = stickyScope.value
      if (isWorkspaceBucket(name) || !scope) return
      writeLastBucket(scope, {
        bucket: name,
        nodeId,
        groupId: selectedGroupId.value || null,
      })
    },
    { immediate: true },
  )

  // The notebooks flavour of the data view keeps its flag while browsing.
  const notebooksQuery = computed(() =>
    route.name === 'notebooks' || route.query.notebooks === '1' ? { notebooks: '1' } : {})

  // The bucket-less route is the picker: it reopens the remembered bucket once
  // this group's list can confirm it, and forgets it when the list cannot.
  watch(
    [bucket, bucketsLoaded, regularBuckets, selectedGroupId, stickyScope],
    () => {
      const scope = stickyScope.value
      // Another node's bucket-less route lists that node; it reopens nothing.
      if (bucket.value || !scope || remoteNodeId.value) return
      const step = stickyBucketStep({
        memory: readLastBucket(scope),
        groupId: selectedGroupId.value,
        buckets: regularBuckets.value.map((entry) => entry.name),
        bucketsLoaded: bucketsLoaded.value,
      })
      if (step.action === 'forget') writeLastBucket(scope, null)
      else if (step.action === 'open') void router.replace({ ...step.route, query: { ...step.route.query, ...notebooksQuery.value } })
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
    // Queued: the session's group query for a new group must follow, not cancel, this.
    const query = {
      ...(nodeId ? { node: nodeId } : {}),
      ...(groupId ? { group: groupId } : {}),
      ...notebooksQuery.value,
    }
    void navigate(() => router.push({ name: 'bucket', params: { bucketId: name }, query }))
  }

  function openBucket(name: string) {
    openBucketOn(name, null)
  }

  // Lists the buckets of one node: its session opens the way a deep link would.
  function showNode(nodeId: string) {
    if (s3.nodeIdFor(nodeId) === requiredNodeId.value) return
    const query = {
      ...(realmNodes.isLocalNode(nodeId) ? {} : { node: nodeId }),
      ...(selectedGroupId.value ? { group: selectedGroupId.value } : {}),
      ...notebooksQuery.value,
    }
    void navigate(() => router.push({ name: 'buckets', query }))
  }

  function pickNode(nodeId: string | null) {
    bucketNodeChoice.value = nodeId
    if (nodeId) showNode(nodeId)
    // A node whose session failed shows no list, so All nodes goes back home.
    else if (contextError.value && remoteNodeId.value) showNode(realmNodes.localNodeId.value ?? '')
  }

  function openSearchHit(hit: BucketSearchHit) {
    // Only a hit that changes the group fires the watcher that consumes this.
    if (hit.group_id !== selectedGroupId.value) hitGroupId = hit.group_id
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
        ...notebooksQuery.value,
      },
    })
  }

  function openFolder(folder: FolderEntry) {
    navigateTo(folder.prefix.replace(/\/$/, ''))
  }

  async function createBucket() {
    const name = newBucketName.value.trim()
    if (!name || !contextReady.value || createBucketBlocker.value) return
    creatingBucket.value = true
    createBucketError.value = null
    // The bucket lives where the session was when the request started.
    const nodeId = remoteNodeId.value
    const groupId = selectedGroupId.value
    try {
      await s3.createBucket(name)
      newBucketName.value = ''
      await bucketList.refresh()
      if (remoteNodeId.value !== nodeId || selectedGroupId.value !== groupId) return
      openBucketOn(name, nodeId)
    } catch (err) {
      createBucketError.value = s3ErrorMessage(err, name)
    } finally {
      creatingBucket.value = false
    }
  }

  // The selected group is part of the active session context, never inferred
  // from a long-lived credential list.
  const activeGroupId = computed(() =>
    contextReady.value ? s3.activeContext.value?.groupId ?? null : null,
  )
  const publicAccess = usePublicAccess(activeGroupId)
  const currentBindSource = computed(() => bindSourceFor(bucket.value, remoteNodeId.value, activeGroupId.value))
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

  // The open file and its tab live in the route (`?object=&tab=`), so a details
  // view is a link a person can share or reload into.
  const DETAIL_TABS = ['general', 'preview', 'versions', 'storage'] as const
  const detailsKey = computed(() => routeString(route.query.object))
  const detailsTab = computed(() => {
    const value = routeString(route.query.tab)
    return (DETAIL_TABS as readonly string[]).includes(value) ? value : 'general'
  })
  const detailsObject = computed<ObjectEntry | null>(() => {
    const key = detailsKey.value
    if (!key) return null
    return (
      objects.value.find((object) => object.key === key) ?? {
        key,
        name: key.slice(s3Prefix.value.length) || key,
      }
    )
  })

  function openDetails(object: ObjectEntry, tab = 'general') {
    const query: LocationQueryRaw = { ...route.query, object: object.key }
    if (tab && tab !== 'general') query.tab = tab
    else delete query.tab
    void router.push({ query })
  }

  function setDetailsTab(tab: string) {
    if (!detailsKey.value || tab === detailsTab.value) return
    const query: LocationQueryRaw = { ...route.query }
    if (tab === 'general') delete query.tab
    else query.tab = tab
    void router.replace({ query })
  }

  function closeDetails() {
    if (!detailsKey.value) return
    const { object: _object, tab: _tab, ...rest } = route.query
    void router.replace({ query: rest })
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

  const detailsReference = computed(() =>
    detailsObject.value
      ? (references.referencedByKey.value.get(detailsObject.value.key) ?? null)
      : null,
  )
  // Structured provenance so the details view can render a real connector link
  // (group-scoped deep link) instead of plain text.
  const previewReferencedFrom = computed(() => {
    const entry = detailsReference.value
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
  // HEAD fallback for remote buckets: the connected node's /data/staging/references
  // listing does not cover them, so probe the single previewed object instead.
  const previewProbeReference = computed(() => Boolean(remoteNodeId.value))

  // Closes a details view the deletion of `scope` invalidated.
  function dropPreviewUnder(match: (key: string) => boolean) {
    if (detailsKey.value && match(detailsKey.value)) closeDetails()
  }

  async function download(object: ObjectEntry) {
    const sourceBucket = bucket.value
    try {
      const name = object.name || object.key.split('/').pop() || object.key
      const url = await s3.downloadUrl(sourceBucket, object.key, remoteNodeId.value, undefined, name)
      // A detached anchor is ignored by some browsers, so it is clicked in the
      // document; the presigned URL is cross-origin, so the name travels in
      // the response's Content-Disposition rather than in `download`.
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    } catch (err) {
      listError.value = s3ErrorMessage(err)
      listAuthError.value = isS3AuthError(err)
    }
  }

  // Every destructive control in the Data views hands its target here, and the
  // one delete dialog decides what may happen to it.
  const deleteRequest = ref<DeleteRequest | null>(null)

  function requestDelete(request: DeleteRequest) {
    deleteRequest.value = request
  }

  function closeDelete() {
    deleteRequest.value = null
  }

  const deleteSyncApplies = computed(() => {
    const request = deleteRequest.value
    if (!request || request.kind === 'bucket' || request.bucket !== bucket.value) return false
    return keyIsSynced(request.key ?? '')
  })

  // Called after every attempt, committed or not: a partly failed folder delete
  // still changed the listing.
  async function onDeleteCompleted(result: DeletionResult) {
    const { request, option, committed } = result
    if (request.kind === 'bucket') {
      if (!committed.length) return
      shortcuts.remove(request.bucket, request.nodeId)
      const scope = stickyScope.value
      const remembered = scope ? readLastBucket(scope) : null
      if (scope && remembered?.bucket === request.bucket && remembered.nodeId === request.nodeId) {
        writeLastBucket(scope, null)
      }
      if (bucket.value === request.bucket && remoteNodeId.value === request.nodeId) {
        await router.push({ name: 'buckets' })
      }
      await bucketList.refresh()
      void loadSyncOverview()
      return
    }
    const done = new Set(committed)
    const donePrefixes = (request.prefixes ?? []).filter((prefix) => done.has(prefix))
    const sameListing =
      request.bucket === bucket.value && request.nodeId === remoteNodeId.value
    if (committed.length && sameListing) {
      const scope = requestScope(request)
      if (scope) selection.pruneSelection(scope)
      if (request.kind === 'selection') selection.dropCommitted(done)
    }
    if (!sameListing) return
    if (committed.length && (option.id === 'delete' || option.id === 'delete-permanently')) {
      dropPreviewUnder((key) =>
        request.kind === 'folder'
          ? key.startsWith(request.key ?? '')
          : request.kind === 'selection'
            ? done.has(key) || donePrefixes.some((prefix) => key.startsWith(prefix))
            : key === request.key,
      )
    }
    await Promise.all([loadObjects(), loadDeleted()])
    if (request.kind === 'folder' || donePrefixes.length) void references.reload()
  }

  const isEmpty = computed(
    () =>
      !listLoading.value &&
      !listError.value &&
      !visibleFolders.value.length &&
      !visibleObjects.value.length &&
      !deletedRows.value.length,
  )

  const viewReady = computed(() =>
    dataViewReady({
      contextReady: contextReady.value,
      remoteBlocked: remoteBlocked.value,
      bucketsLoaded: bucketsLoaded.value,
      bucketsFailed: Boolean(bucketsError.value),
      bucket: bucket.value,
      listLoading: listLoading.value,
      listedOnce: listedOnce.value,
    }),
  )

  return {
    route,
    router,
    authToken,
    currentUser,
    bucket,
    prefix,
    s3Prefix,
    remoteNodeId,
    realmNodes,
    shortcuts,
    selectedGroupId,
    selectedGroupLabel,
    selectedGroupName,
    groupsLoading,
    hasGroups,
    contextBusy,
    contextError,
    contextHold,
    contextReady,
    contextFingerprint,
    viewReady,
    contextMismatch,
    requiredNodeId,
    requiredNodeName,
    issuerNodeName,
    sessionWarning,
    keyTail,
    openSelectedContext,
    activeGroupId,
    publicAccess,
    effectiveEndpoint,
    remoteEndpointMissing,
    remoteBlocked,
    syncByBucket,
    syncKeyFor,
    keyIsSynced,
    syncsForKey,
    bucketSyncCount,
    showSyncButton,
    bindSourceFor,
    currentBindSource,
    linkedFolderFor,
    currentLinkedFolder,
    loadSyncOverview,
    references,
    referenceStats,
    showReferenceStats,
    referenceGroupLabel,
    referencedFrom,
    prefixReferenceSummary,
    bucketList,
    buckets,
    bucketsLoaded,
    bucketsLoading,
    bucketsRefreshing,
    bucketsError,
    bucketsAuthError,
    sidebarBuckets,
    recentBuckets,
    workspaceBuckets,
    workspacesOpen,
    newBucketName,
    newBucketProblem,
    newBucketRefusal,
    createBucketBlocker,
    creatingBucket,
    createBucketError,
    createBucket,
    folders,
    objects,
    visibleFolders,
    visibleObjects,
    nameFilter,
    listShow,
    resetFilters,
    nextToken,
    page: pages.page,
    pageSize: pages.pageSize,
    nextPage,
    previousPage,
    setPageSize,
    listLoading,
    listError,
    listAuthError,
    listedKeys,
    isEmpty,
    loadObjects,
    onListingReset,
    selectedObjectKeys,
    selectedPrefixes,
    selectedCount,
    selectableListedCount,
    allListedSelected,
    someListedSelected,
    setObjectSelected,
    setFolderSelected,
    setAllListedSelected,
    clearSelection: selection.clearSelection,
    openBucketOn,
    showNode,
    pickNode,
    bucketNodeChoice,
    bucketNameFilter,
    allBuckets,
    recentNodes,
    openBucket,
    openSearchHit,
    navigateTo,
    openFolder,
    download,
    canWriteCurrentPrefix,
    writeRestrictionMessage,
    watchPathPrefix,
    uploadRestrictionError,
    requestUpload,
    precheck,
    confirmPrecheckUpload,
    detailsKey,
    detailsTab,
    detailsObject,
    openDetails,
    setDetailsTab,
    closeDetails,
    previewReferencedFrom,
    previewProbeReference,
    dropPreviewUnder,
    showDeleted,
    setShowDeleted,
    deletedObjects,
    deletedRows,
    deletedLoading,
    deletedTruncated,
    deletedError,
    restoringKey,
    restoreObject,
    loadDeleted,
    deleteRequest,
    deleteSyncApplies,
    requestDelete,
    closeDelete,
    onDeleteCompleted,
    refreshSpinning,
    onRefresh,
    retrySpinning,
    onRetryObjects,
  }
}

export type DataManager = ReturnType<typeof useDataManager>
