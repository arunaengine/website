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
