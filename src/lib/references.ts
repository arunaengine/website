// Reference-visibility helpers: the HeadObject metadata fallback, display
// labels and client-side aggregation over GET /staging/references listings.
// Wire types live in lib/api.ts.
import type { SourceConnectorKind, StagingReferenceEntry } from './api'

// Zero-backend fallback: reference-backed objects carry these user-metadata
// keys on HeadObject (the SDK strips the x-amz-meta- prefix) even on nodes
// without the listing endpoint. Presence = referenced, source unknown.
const REFERENCE_METADATA_KEYS = ['aruna-last-refresh', 'aruna-source-etag']

export function hasReferenceMetadata(metadata: Record<string, string>): boolean {
  return REFERENCE_METADATA_KEYS.some((key) => key in metadata)
}

export const REFERENCE_KIND_LABELS: Record<SourceConnectorKind, string> = {
  http: 'HTTP',
  s3: 'S3',
  webdav: 'WebDAV',
  ftp: 'FTP',
  aruna_native: 'Aruna node',
}

// One row of the per-source breakdown: entries grouped by where the bytes
// actually live (connector for external kinds, origin node for aruna_native,
// bare kind when the listing carries neither id).
export interface ReferenceSourceGroup {
  /** Stable grouping identity, unique across connector/node/kind sources. */
  key: string
  kind?: SourceConnectorKind
  connectorId?: string
  originNodeId?: string
  count: number
  bytes: number
}

export interface ReferenceStats {
  count: number
  bytes: number
  groups: ReferenceSourceGroup[]
}

// Client-side aggregation over a (possibly mixed) listing: non-referenced
// entries are skipped, groups come back largest-bytes first.
export function aggregateReferences(entries: StagingReferenceEntry[]): ReferenceStats {
  const groups = new Map<string, ReferenceSourceGroup>()
  let count = 0
  let bytes = 0
  for (const entry of entries) {
    if (!entry.referenced) continue
    count++
    bytes += entry.size
    const key = `${entry.connector_id ?? ''}|${entry.origin_node_id ?? ''}|${entry.kind ?? ''}`
    const group = groups.get(key) ?? {
      key,
      kind: entry.kind,
      connectorId: entry.connector_id,
      originNodeId: entry.origin_node_id,
      count: 0,
      bytes: 0,
    }
    group.count++
    group.bytes += entry.size
    groups.set(key, group)
  }
  return { count, bytes, groups: [...groups.values()].sort((a, b) => b.bytes - a.bytes) }
}

export interface ReferenceLabelOptions {
  /** Resolved connector display name (listSourceConnectors), when known. */
  connectorName?: string | null
  /** Node id → human label (useRealmNodes displayName). */
  nodeLabel?: (nodeId: string) => string
}

// Source name without the path — "node <label>" for aruna_native, else the
// connector name, degrading to the kind label when the id cannot be resolved.
export function referenceSourceName(
  source: { kind?: SourceConnectorKind; originNodeId?: string },
  options: ReferenceLabelOptions = {},
): string {
  if (source.kind === 'aruna_native' || source.originNodeId) {
    const nodeId = source.originNodeId ?? ''
    return `node ${options.nodeLabel?.(nodeId) ?? (nodeId || 'unknown')}`
  }
  if (options.connectorName) return options.connectorName
  if (source.kind) return REFERENCE_KIND_LABELS[source.kind] ?? source.kind
  return 'external source'
}

// Full "…<name> · <source_path>" tail of the preview line.
export function referenceSourceLabel(
  entry: StagingReferenceEntry,
  options: ReferenceLabelOptions = {},
): string {
  const name = referenceSourceName(
    { kind: entry.kind, originNodeId: entry.origin_node_id },
    options,
  )
  return entry.source_path ? `${name} · ${entry.source_path}` : name
}
