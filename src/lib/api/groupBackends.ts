import { apiRequest, type ApiClientOptions } from './client'

// ── Group storage backends ──────────────────────────────────────────────────
// GET/POST /data/groups/{gid}/storage/backends, GET/PUT/DELETE .../{bid}: verified
// against aruna api/src/routes/group_backends.rs, with the per-kind key
// allowlists in operations/src/group_backends/validation.rs. Every route takes
// group ADMIN. Secrets live in their own keyspace and are never returned.
//
// Three fields/routes are gated on presence: `disabled` (absent on older
// nodes), the enable route and the credentials route (both 404 there). DELETE
// disables the backend once that lands; before it, DELETE is a hard delete and
// can answer 409 while the backend still holds data.
export type GroupBackendKind = 's3' | 'gcs' | 'azblob' | 'azdls' | 'b2'

export interface GroupBackendResponse {
  backend_id: string
  group_id: string
  /** Open string: a node may report a kind this portal does not know. */
  kind: string
  name: string
  public_config: Record<string, string>
  /** Disabled backends refuse new writes; stored objects stay readable. */
  disabled?: boolean
}

export interface ListGroupBackendsResponse {
  backends: GroupBackendResponse[]
}

// Shared body of POST (add) and PUT (replace). PUT changes name and
// credentials only: the keys naming the physical store are fixed after create,
// and a disabled backend refuses it.
export interface GroupBackendRequest {
  name: string
  kind: GroupBackendKind
  public_config: Record<string, string>
  secret_config: Record<string, string>
}

/** The group's storages as one node answers them; useAruna's list asks the connected node. */
export function getGroupBackends(groupId: string, client: ApiClientOptions): Promise<ListGroupBackendsResponse> {
  return apiRequest<ListGroupBackendsResponse>(`/data/groups/${encodeURIComponent(groupId)}/storage/backends`, {}, client)
}

// GET /data/groups/{gid}/storage/buckets: one page of the group's buckets on this node, in name
// order, each with the storage that keeps its files. Group ADMIN; older nodes answer 404.
export interface StorageBucket {
  bucket: string
  /** Null for Aruna storage on this node. */
  backend_id: string | null
  provider_bucket: string | null
  folder: string | null
  /** New uploads go to the storage's shared bucket, named by Aruna. */
  shared: boolean
  /** The rule that links the whole bucket, if any. */
  import_id: string | null
  write_pattern: string | null
}

export function listStorageBuckets(
  groupId: string,
  page: { limit?: number; after?: string | null },
  client: ApiClientOptions,
): Promise<{ buckets: StorageBucket[]; next?: string | null }> {
  const query = new URLSearchParams()
  if (page.limit) query.set('limit', String(page.limit))
  if (page.after) query.set('after', page.after)
  const text = query.toString()
  return apiRequest(`/data/groups/${encodeURIComponent(groupId)}/storage/buckets${text ? `?${text}` : ''}`, {}, client)
}
