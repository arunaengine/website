import type { RouteLocationRaw } from 'vue-router'

// Watch subscriptions (backend /system/notifications/watches). A watch is a
// read-authorized path prefix, never a typed resource: data events live under
// `s3/{group_id}/{node_id}/{bucket}/{key-prefix}` and dataset events under
// `meta/{group_id}/{document-path-prefix}`. The two namespaces carry distinct
// event kinds, so a single watch never mixes them.

export type WatchEventKind =
  | 'metadata_created'
  | 'data_uploaded'
  | 'sync_completed'
  | 'sync_failed'

export type WatchNamespace = 's3' | 'meta'

export interface WatchEventKindInfo {
  kind: WatchEventKind
  label: string
  description: string
}

export const WATCH_EVENT_KINDS: WatchEventKindInfo[] = [
  {
    kind: 'metadata_created',
    label: 'Dataset created',
    description:
      'Notifies you when a new dataset is created under this path, including every path below it. Edits to a dataset that already exists are not covered.',
  },
  {
    kind: 'data_uploaded',
    label: 'Data uploaded',
    description:
      'Notifies you when any object is uploaded under this folder, including all folders below it, a watch always covers a whole prefix, never a single object.',
  },
  {
    kind: 'sync_completed',
    label: 'Sync completed',
    description: 'Notifies you when a sync that copies data out of this folder finishes a run.',
  },
  {
    kind: 'sync_failed',
    label: 'Sync failed',
    description: 'Notifies you when a sync that copies data out of this folder reports a failure.',
  },
]

// What every watch surface must state: where notifications appear, that they
// are in-app only, how long they are kept and how they stop.
export const WATCH_DELIVERY_NOTE =
  'Notifications appear under the bell icon in the top bar. They are in-app only and are kept for 30 days. You can stop watching here or under Settings, Watched resources. If you lose read access, notifications stop.'

// Mirrors the backend rule in watch_permission_path: `meta/` accepts exactly
// metadata_created, `s3/` any non-empty subset of the three data kinds.
const NAMESPACE_KINDS: Record<WatchNamespace, WatchEventKind[]> = {
  meta: ['metadata_created'],
  s3: ['data_uploaded', 'sync_completed', 'sync_failed'],
}

export function eventsFor(namespace: WatchNamespace): WatchEventKindInfo[] {
  return WATCH_EVENT_KINDS.filter((info) => NAMESPACE_KINDS[namespace].includes(info.kind))
}

// Sync events are emitted under the SOURCE bucket prefix, so they only ever
// fire for a folder that a sync relationship copies data out of.
export function isSyncEventKind(kind: string): boolean {
  return kind === 'sync_completed' || kind === 'sync_failed'
}

export function watchEventLabel(kind: string): string {
  return WATCH_EVENT_KINDS.find((k) => k.kind === kind)?.label ?? kind.replace(/_/g, ' ')
}

// Mirrors the backend's normalize_document_path (trim whitespace, then strip
// surrounding slashes) so client-built prefixes pass its canonical-form check.
export function normalizeDocumentPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '')
}

// Mirrors aruna core/src/structs/notification_watch.rs data_watch_resource_path:
// `s3/{group_id}/{node_id}/{bucket}/{key}`; uploads emit exactly this shape.
// The trailing slash after the bucket is required even for an empty key prefix.
export function dataWatchPathPrefix(groupId: string, nodeId: string, bucket: string, keyPrefix = ''): string {
  return `s3/${groupId}/${nodeId}/${bucket}/${keyPrefix}`
}

export interface S3NodeCandidate {
  nodeId: string
  s3Url?: string | null
}

// The node segment must be the node whose S3 endpoint receives the upload;
// uploads emit that node's id, so a watch registered under any other node id
// never fires. Resolves the endpoint's owner, falling back to the local node.
export function s3EndpointNodeId(
  endpoint: string | null,
  local: S3NodeCandidate | null,
  realmNodes: S3NodeCandidate[],
): string | null {
  const normalize = (url: string | null | undefined) => (url ? url.replace(/\/+$/, '') : null)
  const target = normalize(endpoint)
  if (!target) return null
  if (local && normalize(local.s3Url) === target) return local.nodeId
  const owner = realmNodes.find((node) => normalize(node.s3Url) === target)
  if (owner) return owner.nodeId
  return local?.nodeId ?? null
}

export function metaWatchPathPrefix(groupId: string, documentPathPrefix: string): string {
  return `meta/${groupId}/${normalizeDocumentPath(documentPathPrefix)}`
}

export interface WatchPathInfo {
  namespace: 's3' | 'meta'
  groupId: string
  nodeId?: string
  bucket?: string
  // Key prefix (s3) or document path prefix (meta); may be empty.
  prefix: string
  // Human-readable resource label for list rows.
  label: string
  link: RouteLocationRaw | null
}

// Best-effort split of a server-returned path_prefix into displayable parts.
// Unknown shapes return null and render verbatim.
export function parseWatchPath(pathPrefix: string): WatchPathInfo | null {
  if (pathPrefix.startsWith('s3/')) {
    const parts = pathPrefix.slice(3).split('/')
    if (parts.length < 4) return null
    const [groupId, nodeId, bucket] = parts
    if (!groupId || !nodeId || !bucket) return null
    const prefix = parts.slice(3).join('/')
    const linkPrefix = prefix.replace(/\/$/, '')
    return {
      namespace: 's3',
      groupId,
      nodeId,
      bucket,
      prefix,
      label: `${bucket}/${prefix}`,
      link: { name: 'bucket', params: { bucketId: bucket }, query: linkPrefix ? { prefix: linkPrefix } : {} },
    }
  }
  if (pathPrefix.startsWith('meta/')) {
    const remainder = pathPrefix.slice(5)
    const slash = remainder.indexOf('/')
    if (slash <= 0) return null
    const groupId = remainder.slice(0, slash)
    const prefix = remainder.slice(slash + 1)
    return {
      namespace: 'meta',
      groupId,
      prefix,
      // An empty document prefix is the group-wide dataset watch.
      label: prefix || 'All datasets of the group',
      link: { name: 'datasets', query: { ...(prefix ? { q: prefix } : {}), group: groupId } },
    }
  }
  return null
}
