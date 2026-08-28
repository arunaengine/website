// Source connectors (GET/POST /groups/{group_id}/connectors, verified against
// aruna api/src/routes/connectors.rs). Real, served contract; no gating.
export type SourceConnectorKind = 'http' | 's3' | 'webdav' | 'ftp' | 'aruna_native'

export interface SourceConnectorSummary {
  connector_id: string
  group_id: string
  name: string
  kind: SourceConnectorKind
  public_config: Record<string, string>
  created_at: string
  updated_at: string
  created_by: string
  has_secret_config: boolean
}

export interface ListSourceConnectorsResponse {
  connectors: SourceConnectorSummary[]
}

// Shared body of POST and PUT (CreateSourceConnectorRequest /
// ReplaceSourceConnectorRequest are field-identical in the backend). PUT is a
// full replace: secret_config always overwrites the stored secrets, and
// responses never echo them back (only has_secret_config). Allowed/required
// config keys are validated per kind server-side
// (aruna operations/src/connectors/validation.rs); `aruna_native` is rejected.
export interface SourceConnectorRequest {
  name: string
  kind: SourceConnectorKind
  public_config: Record<string, string>
  secret_config?: Record<string, string>
}

// Connector check & browse (agreed portal↔backend contract; the endpoints are
// new; older nodes answer 404/501 and callers degrade by hiding/disabling the
// affordance with a short hint):
//   POST /groups/{gid}/connectors/check            (inline config, incl. secrets)
//   POST /groups/{gid}/connectors/{cid}/check      (stored config + secrets)
//   GET  /groups/{gid}/connectors/{cid}/entries?path=&limit=
export interface ConnectorCheckResponse {
  ok: boolean
  latency_ms?: number
  error?: string
}

export interface ConnectorEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
  size?: number
  modified_ms?: number
}

export interface ConnectorEntriesResponse {
  entries: ConnectorEntry[]
  truncated: boolean
}
