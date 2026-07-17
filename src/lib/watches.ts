import type { RouteLocationRaw } from 'vue-router'

// Watch subscriptions (backend /notifications/watches). Path prefixes are
// canonical resource identities: data events live under
// `s3/{group_id}/{node_id}/{bucket}/{key-prefix}` and metadata events under
// `meta/{group_id}/{document-path-prefix}`. The two namespaces carry distinct
// event kinds, so a single watch never mixes them.

export type WatchEventKind = 'metadata_created' | 'data_uploaded'

export interface WatchEventKindInfo {
  kind: WatchEventKind
  label: string
  description: string
}

export const WATCH_EVENT_KINDS: WatchEventKindInfo[] = [
  {
    kind: 'metadata_created',
    label: 'Metadata created',
    description: 'A metadata document is created under this path.',
  },
  {
    kind: 'data_uploaded',
    label: 'Data uploaded',
    description: 'An object is uploaded under this prefix.',
  },
]

export function watchEventLabel(kind: string): string {
  return WATCH_EVENT_KINDS.find((k) => k.kind === kind)?.label ?? kind.replace(/_/g, ' ')
}

// Mirrors the backend's normalize_document_path (trim whitespace, then strip
// surrounding slashes) so client-built prefixes pass its canonical-form check.
export function normalizeDocumentPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '')
}

// The trailing slash after the bucket is required even for an empty key prefix.
export function dataWatchPathPrefix(groupId: string, nodeId: string, bucket: string, keyPrefix = ''): string {
  return `s3/${groupId}/${nodeId}/${bucket}/${keyPrefix}`
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
      label: prefix || '(all documents)',
      link: { name: 'search', query: { ...(prefix ? { q: prefix } : {}), group: groupId } },
    }
  }
  return null
}
