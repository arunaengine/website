// ── Storage routing ─────────────────────────────────────────────────────────
// GET/PUT /data/buckets/{bucket}/storage/routing and /data/groups/{gid}/storage/routing:
// verified against aruna api/src/routes/storage_routing.rs. Group ADMIN.
// A target names exactly one of `backend_id` (binds that group backend) or
// `class` (a preference that may fall through to the node default); operator
// backend names are rejected. `warnings` is advisory only: rules are stored
// regardless, because the record replicates to nodes with other class tables.
export interface RoutingTarget {
  backend_id?: string
  class?: string
}

export interface StorageRoutingRule {
  key_prefix: string
  /** Whole-key match instead of a prefix match. */
  exact: boolean
  target: RoutingTarget
}

export interface BucketRoutingResponse {
  bucket: string
  rules: StorageRoutingRule[]
  warnings: string[]
}

export interface GroupRoutingResponse {
  group_id: string
  default_target?: RoutingTarget | null
  warnings: string[]
}
