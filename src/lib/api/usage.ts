// GET /info/usage; may grow extra fields, unknown ones are ignored.
export interface UsageResponse {
  buckets: number
  objects: number
  stored_blobs: number
  stored_bytes: number
  // Newer backends add logical bytes and, for authenticated callers, realm-wide totals.
  logical_bytes?: number
  referenced_bytes: number
  realm?: UsageTotals
  // Realm-wide total of live metadata documents; only on GET /info/usage.
  metadata_documents?: number
  // Exact lifecycle-live purpose counts; only on GET /groups/{id}/usage.
  dataset_count?: number | null
  profile_count?: number | null
  process_run_count?: number | null
  // Present on GET /groups/{id}/usage from quota-aware backends.
  quota?: GroupQuotaStatus
}

export interface GroupQuotaStatus {
  // Effective group quota (override else default); null means unlimited.
  quota_bytes: number | null
  // Quota × grace: the enforced hard cap; null means unlimited.
  ceiling_bytes: number | null
  warn_threshold_percent: number
  // True when group usage has reached the warn threshold; false when unlimited.
  warning: boolean
}

export interface UsageTotals {
  buckets: number
  objects: number
  stored_blobs: number
  stored_bytes: number
  logical_bytes: number
  referenced_bytes: number
}

// ---------------------------------------------------------------------------
// Usage history: arunaengine/aruna#250 workplan item 3 ("history snapshots
// with their endpoint"). The backend does NOT serve this yet; the types below
// document the assumed contract so the portal side flips on trivially:
//   GET /groups/{id}/usage/history?from=<rfc3339>&to=<rfc3339>&resolution=hour|day|week
//   -> 200 UsageHistoryResponse
// Callers MUST gate on featureEnabled('usageHistory'); the flag ships off.
// ---------------------------------------------------------------------------
export type UsageHistoryResolution = 'hour' | 'day' | 'week'

export interface UsageHistoryPoint {
  // Snapshot time, RFC3339.
  timestamp: string
  totals: UsageTotals
  // Server-computed quota state at snapshot time, when the backend records it.
  quota?: GroupQuotaStatus | null
}

export interface UsageHistoryResponse {
  group_id: string
  resolution: UsageHistoryResolution
  points: UsageHistoryPoint[]
}
