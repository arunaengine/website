// ── Databases of the realm ──────────────────────────────────────────────────
// Verified against aruna api/src/routes/databases.rs and database_types.rs
// (feat/distributed-buckets-metadata). A database is a bucket plus a dataset that describes it.
// An entry holds only ids. Marking needs WRITE on `/{realm}/admin/databases` and the agreement
// of the group that owns the bucket; the management-only calls are relayed by any node.
import { apiRequest, type ApiClientOptions } from './client'

export type DatabaseTarget =
  | { kind: 'distributed'; set_id: string }
  | { kind: 'ordinary'; node_id: string; bucket: string }

export interface DatabaseEntryView {
  entry_id: string
  dataset_id: string
  target: DatabaseTarget
  owner_group: string
}

/** `description_unavailable` stays listed; the other two show in the curator view only. */
export type DatabaseStateName = 'active' | 'description_unavailable' | 'dataset_hidden' | 'no_longer_linked'

export interface DatabaseView extends DatabaseEntryView {
  /** The bucket name; empty in the curator view for a bucket the caller cannot read. */
  bucket: string
  state: DatabaseStateName
  /** The dataset's title, when the caller may read the dataset. */
  title?: string | null
  graph_iri?: string | null
  document_path?: string | null
  /** Anyone, also without a login, may read the bucket; otherwise realm users with access. */
  public: boolean
}

export interface DatabaseListResponse {
  databases: DatabaseView[]
  /** Pass as `after` for the next page; absent on the last page. */
  next_after?: string | null
}

export interface DatabaseListQuery {
  after?: string
  /** 1 to 100, default 25. */
  limit?: number
  /** Also inactive entries and why. Needs WRITE on the databases path, else 403. */
  curation?: boolean
}

export interface MarkDatabaseRequest {
  /** An existing entry to retarget; a new entry when absent. */
  entry_id?: string
  /** Its root must already name the bucket root as a Dataset-typed `hasPart`. */
  dataset_id: string
  target: DatabaseTarget
}

export interface MarkDatabaseResponse {
  /** `pending_consent` waits for an admin of the group that owns the bucket. */
  status: 'published' | 'pending_consent'
  entry: DatabaseEntryView
  request_id?: string | null
}

export interface DatabaseRequestView {
  request_id: string
  entry: DatabaseEntryView
  /** The user who asked. */
  curator: string
  created_at_ms: number
}

export function listDatabases(
  query: DatabaseListQuery = {},
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<DatabaseListResponse> {
  return apiRequest('/data/databases', { query: { ...query }, signal }, client)
}

export function markDatabase(body: MarkDatabaseRequest, client: ApiClientOptions = {}): Promise<MarkDatabaseResponse> {
  return apiRequest('/system/realm/databases', { method: 'POST', body: JSON.stringify(body) }, client)
}

export function removeDatabase(entryId: string, client: ApiClientOptions = {}): Promise<void> {
  return apiRequest(`/system/realm/databases/${encodeURIComponent(entryId)}`, { method: 'DELETE' }, client)
}

export async function listDatabaseRequests(client: ApiClientOptions = {}): Promise<DatabaseRequestView[]> {
  const response = await apiRequest<{ requests: DatabaseRequestView[] }>('/system/realm/databases/requests', {}, client)
  return response.requests
}

/** An admin of the owning group agrees; the entry is published. */
export function approveDatabaseRequest(requestId: string, client: ApiClientOptions = {}): Promise<DatabaseEntryView> {
  return apiRequest(`/system/realm/databases/requests/${encodeURIComponent(requestId)}/approve`, { method: 'POST' }, client)
}

/** The curator withdraws the request, or an admin of the owning group declines it. */
export function dropDatabaseRequest(requestId: string, client: ApiClientOptions = {}): Promise<void> {
  return apiRequest(`/system/realm/databases/requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' }, client)
}
