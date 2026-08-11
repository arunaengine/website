import { apiRequest, type ApiClientOptions } from './api'

// Realm-admin surface over a node's sync-quarantine store, verified against
// aruna api/src/routes/sync_quarantine.rs. Evidence is node-local: the answers
// describe the node this portal talks to, not the whole realm.

export interface QuarantineRecord {
  /** Opaque row id: hex of topic || actor || actor_seq. */
  id: string
  topic: string
  actor: string
  actor_seq: number
  /** Absent when the payload never decoded into an event. */
  event_id?: string
  family?: string
  target?: string
  origin_node_id?: string
  reason: string
  quarantined_at_ms: number
  acknowledged: boolean
  event_bytes: number
}

export interface QuarantineUsage {
  records: number
  bytes: number
  max_records: number
  max_bytes: number
}

export interface QuarantinePage {
  records: QuarantineRecord[]
  next_cursor?: string
  usage: QuarantineUsage
}

export interface QuarantineInspect {
  record: QuarantineRecord
  /** Decoded envelope summary; absent when the retained bytes cannot be decoded. */
  event?: string
}

export interface QuarantinePruneResult {
  pruned: number
  scanned: number
  next_cursor?: string
  usage: QuarantineUsage
}

export interface QuarantineQuery {
  cursor?: string
  /** Hex sync topic; restricts the page to that topic's evidence. */
  topic?: string
  /** Page size / rows scanned per prune pass (default 50, max 200). */
  limit?: number
}

/** True for the hex strings the API decodes (cursor and topic filters). */
export function isHexKey(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value)
}

export function listQuarantine(query: QuarantineQuery, client: ApiClientOptions): Promise<QuarantinePage> {
  return apiRequest<QuarantinePage>('/admin/sync-quarantine', { query: { ...query } }, client)
}

export function readQuarantine(recordId: string, client: ApiClientOptions): Promise<QuarantineInspect> {
  return apiRequest<QuarantineInspect>(`/admin/sync-quarantine/${encodeURIComponent(recordId)}`, {}, client)
}

// POST acknowledge — idempotent; returns the updated record.
export function ackQuarantine(recordId: string, client: ApiClientOptions): Promise<QuarantineRecord> {
  return apiRequest<QuarantineRecord>(
    `/admin/sync-quarantine/${encodeURIComponent(recordId)}/acknowledge`,
    { method: 'POST' },
    client,
  )
}

// DELETE — one bounded pass: scans up to `limit` rows from `cursor`, removes
// the acknowledged ones and returns `next_cursor` when rows remain unscanned,
// so a full prune is a caller-driven loop of passes.
export function pruneQuarantine(query: QuarantineQuery, client: ApiClientOptions): Promise<QuarantinePruneResult> {
  return apiRequest<QuarantinePruneResult>('/admin/sync-quarantine', { method: 'DELETE', query: { ...query } }, client)
}
