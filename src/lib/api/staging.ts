import type { SourceConnectorKind } from './connectors'

// Batch staging (agreed contract): POST /data/staging/batch stages many items (and
// whole prefixes) through one connector in a single call.
export interface StagingBatchItem {
  source_path: string
  target_key: string
}

export interface StagingBatchPrefix {
  source_prefix: string
  target_prefix: string
}

export interface StagingBatchRequest {
  group_id: string
  node_id?: string
  connector_id: string
  bucket: string
  strategy: StagingStrategy
  items?: StagingBatchItem[]
  prefixes?: StagingBatchPrefix[]
  /** Import the rows of a CSV or TSV list instead of items and prefixes; reference strategy only. */
  table?: TableImport
}

export interface StagingBatchResult {
  source_path: string
  target_key: string
  status: 'ok' | 'error'
  error?: string
}

export interface StagingBatchResponse {
  results: StagingBatchResult[]
}

// Blob staging (POST /data/staging, verified against aruna api/src/routes/staging.rs).
// Internally tagged: the `strategy` discriminant sits beside the flattened
// target fields. Synchronous one-shot materialization (201 on success);
// 'sync' exists in the API enum but returns 501 on today's backends.
export type StagingStrategy = 'snapshot' | 'reference' | 'sync'

export interface StageBlobSubmission {
  strategy: StagingStrategy
  group_id: string
  connector_id: string
  source_path: string
  bucket: string
  key: string
}

export interface StageBlobResponse {
  strategy: StagingStrategy
  bucket: string
  key: string
  version_id: string
  size: number
  content_type?: string | null
  etag?: string | null
  last_modified?: string | null
}

// ---------------------------------------------------------------------------
// Durable staging jobs. POST accepts StagingBatchRequest and recursively walks
// prefixes; list/detail expose truthful item/byte progress and per-item errors.
// ---------------------------------------------------------------------------
export type StagingJobState = 'queued' | 'running' | 'done' | 'failed'
export type StagingJobPhase =
  | 'queued'
  | 'discovering'
  | 'inspecting'
  | 'registering'
  | 'downloading'
  | 'writing'
  | 'completed'
  | 'failed'

export interface StagingJobProgress {
  items_current: number
  items_total?: number | null
  bytes_current: number
  bytes_total?: number | null
  current_path?: string | null
}

export interface StagingJob {
  job_id: string
  strategy: 'reference' | 'snapshot'
  group_id: string
  connector_id: string
  bucket: string
  state: StagingJobState
  phase: StagingJobPhase
  submitted_at: string
  finished_at?: string | null
  error?: string | null
  /** While set, the job waits until then because its source asked it to slow down. */
  paused_until?: string | null
  progress: StagingJobProgress
  errors: Array<{ source_path: string; target_key: string; error: string }>
}

export interface ListStagingJobsResponse {
  jobs: StagingJob[]
  next_cursor?: string
}

export interface CreateStagingJobResponse {
  job_id: string
  created: boolean
}

// ---------------------------------------------------------------------------
// Reference visibility (agreed contract):
//   GET /data/staging/references?bucket=<b>&prefix=<p>&limit=&cursor=
// reports which keys in a bucket are backed by a reference (an external
// connector source or another Aruna node) instead of node-local bytes. The
// listing MAY include non-referenced entries (referenced: false); consumers
// aggregate client-side on `referenced`.
// ---------------------------------------------------------------------------
export interface StagingReferenceEntry {
  key: string
  size: number
  referenced: boolean
  /** Source kind; aruna_native marks a reference into another realm node. */
  kind?: SourceConnectorKind
  /** Path/URL of the object at its source, in the connector's namespace. */
  source_path?: string
  /**
   * Connector the reference was staged through (non-native kinds). NOT
   * mutually exclusive with origin_node_id: external-kind entries may carry
   * both, the backend populates the hosting node alongside the connector.
   */
  connector_id?: string
  /**
   * Realm node actually holding the bytes. Always set for aruna_native
   * (which never has a connector_id); external-kind entries may carry it
   * together with connector_id.
   */
  origin_node_id?: string
}

export interface StagingReferencesResponse {
  entries: StagingReferenceEntry[]
  /** Opaque cursor; omitted on the last page. Pass back verbatim. */
  next_cursor?: string
}

// Import from a list (`table` of a staging job, core/src/structs/execution/table.rs). `size`,
// `checksums` and `modified` are planned server fields (plans/ncbi-summary-import.md).
export type TableHeader = 'first_row' | 'last_comment' | { row: number } | { columns: string[] }

export interface TableFormat {
  delimiter: string
  /** `null` reads quote characters as plain text. */
  quote: string | null
  header: TableHeader
  comment: string | null
  nulls: string[]
  /** `null` decides by a `.gz` name or the gzip magic bytes. */
  gzip: boolean | null
}

export type TableSource = { connector: string } | { object: { bucket: string; key: string } }

export type ChecksumAlgorithm = 'md5' | 'sha256' | 'sha1'

export interface TableRows {
  kind: 'file' | 'folder'
  source: string
  target: string
  filter: { column: string; any_of: string[] }[]
  keep: string[] | null
  text: string[]
  exact: string[]
  size?: string
  checksums?: { algorithm: ChecksumAlgorithm; column: string }[]
  modified?: string
}

export interface TableImport {
  source: TableSource
  format: TableFormat
  rows: TableRows
  rate?: number
}
