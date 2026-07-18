// Bucket sync helpers: parsing the ARN identity carried by sync relationships
// and shared display mappings. Wire types live in lib/api.ts.
import type { SyncMode, SyncRelationshipState } from './api'

// `arn:aruna:<realm>:<node>:s3/<bucket>[/<prefix>]` (aruna core ArunaArn
// Display impl). The prefix keeps its exact server form — it may end in '/'.
export interface ParsedArunaArn {
  realmId: string
  nodeId: string
  /** Resource type segment; bucket ARNs use 's3'. */
  resourceType: string
  bucket: string
  /** Key prefix under the bucket; empty for a whole-bucket ARN. */
  prefix: string
}

const ARN_RE = /^arn:aruna:([^:]+):([^:]+):([^:/]+)\/(.+)$/

export function parseArunaArn(arn: string): ParsedArunaArn | null {
  const match = ARN_RE.exec(arn)
  if (!match) return null
  const [, realmId, nodeId, resourceType, path] = match
  const slash = path.indexOf('/')
  const bucket = slash === -1 ? path : path.slice(0, slash)
  if (!bucket) return null
  return {
    realmId,
    nodeId,
    resourceType,
    bucket,
    prefix: slash === -1 ? '' : path.slice(slash + 1),
  }
}

// Human "bucket/prefix" tail of a sync endpoint; falls back to the raw ARN
// when the string does not parse (never hide the identity).
export function arnLocationLabel(arn: string): string {
  const parsed = parseArunaArn(arn)
  if (!parsed) return arn
  return parsed.prefix ? `${parsed.bucket}/${parsed.prefix}` : parsed.bucket
}

export const SYNC_MODE_LABELS: Record<SyncMode, string> = {
  once: 'Once',
  continuous: 'Keep in sync',
  reference: 'Reference',
}

export function syncModeLabel(mode: SyncMode): string {
  return SYNC_MODE_LABELS[mode] ?? mode
}

export type SyncStateVariant = 'success' | 'warn' | 'destructive' | 'outline'

// Status-dot color per relationship state; unknown future states render neutral.
export function syncStateVariant(state: SyncRelationshipState): SyncStateVariant {
  if (state === 'enabled') return 'success'
  if (state === 'paused') return 'warn'
  if (state === 'failed') return 'destructive'
  return 'outline'
}

// Client-side prefix overlap, mirroring the backend list filter: two key
// prefixes overlap when either is a prefix of the other (an empty prefix
// covers the whole bucket).
export function prefixesOverlap(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a)
}
