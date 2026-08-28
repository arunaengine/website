export interface InfoResponse {
  node: {
    status: string
    realm_id: string
    peer_id: string
    capabilities: 'management' | 'server'
  }
  api_version?: string
  portal?: PortalStatus | null
  my_addresses: string[]
  connections?: unknown
  services: {
    interfaces: InterfaceServicesStatus
    database?: { status: string }
    network?: { status: string }
    blob?: BlobServiceStatus
  }
  warnings: string[]
}

export interface PortalStatus {
  installed: boolean
  version?: string | null
  source?: string | null
}

export interface InterfaceServicesStatus {
  rest: InterfaceStatus
  s3: InterfaceStatus
}

export interface InterfaceStatus {
  status: string
  bind?: string | null
  url?: string | null
}

// /info services.blob: verified against aruna api/src/routes/info.rs
// (BlobServiceStatus / BackendStatus). `backends` lists every registered
// backend; the headline `status` is the default backend's. Nodes that predate
// configurable storage omit `backends` entirely.
export interface BlobServiceStatus {
  status: string
  backend?: string | null
  max_bucket_size?: number | null
  multipart_bucket?: string | null
  backends?: BackendStatus[]
}

export interface BackendStatus {
  name: string
  /** Driver type (s3, filesystem, …), not the tenant-facing kind. */
  backend: string
  /** Storage class label tenant routing rules may prefer; null when unlabelled. */
  class?: string | null
  allow_tenants: boolean
  /** Operator limit for user data; null/absent means no limit. */
  quota_bytes?: number | null
  default: boolean
  status: string
  /**
   * Bytes stored on this backend. Served only once per-backend quota
   * enforcement ships (consolidation plan B9); while it is absent nothing is
   * rejected for going over `quota_bytes`.
   */
  used_bytes?: number
}

export interface RealmInfoResponse {
  realm_id: string
  description?: string | null
  metadata_replication: { default_replication_factor: number | null }
  public_overview?: {
    live_datasets: number | null
    groups: number | null
    nodes_configured: number | null
  }
  // Public on newer backends: whether this node is a management node, and the
  // api base urls of the realm's management nodes, this node's own first.
  is_management_node?: boolean
  management_urls?: string[]
  oidc_providers: Array<{
    id: string
    issuer: string
    audience: string
    discovery_url: string
  }>
  discovery: unknown
  nodes: RealmNodeInfo[]
  // Present on newer backends; older deployments omit the quota policy.
  quota?: RealmQuotaConfig
  interfaces: InterfaceServicesStatus
}

export interface RealmQuotaConfig {
  default_group_quota_bytes: number | null
  grace_factor_percent: number
  warn_threshold_percent: number
  group_overrides: RealmGroupQuotaOverride[]
  max_groups_per_user: number | null
  user_group_cap_overrides: RealmUserGroupCapOverride[]
  max_devices_per_user: number | null
}

export interface RealmGroupQuotaOverride {
  group_id: string
  quota_bytes: number | null
  grace_factor_percent: number | null
}

export interface RealmUserGroupCapOverride {
  user_id: string
  max_groups: number | null
}

export interface RealmNodePlacement {
  location: string
  weight: number
  full: boolean
  draining: boolean
}

// One compute backend a node advertises (info.rs ExecutorCapabilityResponse).
// `file_staging` means the executor can materialize inputs on local disk,
// `direct_s3` that it reads them straight from S3.
export interface ExecutorCapability {
  kind: string
  file_staging: boolean
  direct_s3: boolean
}

export interface RealmNodePublishedInfo {
  // Empty on a node with no compute backend configured.
  executors: ExecutorCapability[]
  labels: Record<string, string>
  urls: { api?: string | null; s3?: string | null }
  utilization: {
    storage_bytes_used: number
    // Omitted from the wire until a node publishes them
    // (skip_serializing_if on the backend response struct).
    documents_held?: number
    load_permille?: number
    heartbeat_at_ms: number
  }
  updated_at_ms: number
}

export interface RealmNodeInfo {
  node_id: string
  kind: 'management' | 'server' | 'user'
  // Owner of a 'user' node; null for infrastructure nodes. Absent on backends
  // that predate device enrollment.
  owner?: string | null
  configured: boolean
  present: boolean
  // Infrastructure nodes report 'connected'/'configured' from realm presence.
  // A device publishes none, so it reports 'seen' when it reached the
  // answering node in the last three minutes and 'unknown' otherwise.
  connection_status: 'connected' | 'configured' | 'seen' | 'unknown'
  // Unix ms of a device's last authenticated contact with the answering node.
  // Devices only, and absent until that node has seen one.
  last_seen_ms?: number
  placement?: RealmNodePlacement | null
  // Latest self-published node document; null until the node publishes one.
  info?: RealmNodePublishedInfo | null
  /** @deprecated older field, never served by current backends */
  rest_url?: string | null
}
