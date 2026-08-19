import { apiRequest, type ApiClientOptions } from './api'

export type BacklinkPreflightMode = 'local' | 'distributed'
export type BacklinkPreflightStorageOperation =
  | 'latest_version_tombstone'
  | 'all_versions_purge'

export type BacklinkPreflightTarget =
  | {
      kind: 'content_w3ids'
      content_w3ids: string[]
      remove_all_resolvable_locations?: boolean
    }
  | {
      kind: 'bucket_prefix'
      bucket: string
      prefix?: string
      operation?: BacklinkPreflightStorageOperation
    }

export interface BacklinkPreflightRequest {
  target: BacklinkPreflightTarget
  mode?: BacklinkPreflightMode
  allow_partial?: boolean
  limit?: number
  cursor?: string
}

export interface BacklinkPreflightLocation {
  node_id: string
  bucket: string
  key: string
  version_id: string
}

export interface BacklinkPreflightVisibleReference {
  document_id: string
  title: string
}

export interface BacklinkPreflightTargetResult {
  content_w3id: string
  targeted_versions: BacklinkPreflightLocation[]
  visible_references: BacklinkPreflightVisibleReference[]
  hidden_references_exist: boolean
  would_remove_last_resolvable_aruna_location: boolean
  location_impact_complete: boolean
}

export interface BacklinkPreflightExcludedForm {
  form: string
  reason: string
}

export interface BacklinkPreflightNodeFreshness {
  node_id: string
  index_state: string
  oldest_status_updated_at_ms: number | null
}

export interface BacklinkPreflightCoverage {
  queried_scope: string
  queried_forms: string[]
  excluded_forms: BacklinkPreflightExcludedForm[]
  node_freshness: BacklinkPreflightNodeFreshness[]
  target_resolution_complete: boolean
  path_style_endpoint_coverage_complete: boolean
  realm_coverage_complete: boolean
}

export interface BacklinkPreflightResponse {
  targets: BacklinkPreflightTargetResult[]
  next_cursor: string | null
  truncated: boolean
  nodes_queried: number
  nodes_failed: number
  complete: boolean
  failed_partitions: string[]
  coverage: BacklinkPreflightCoverage
}

export function preflightBacklinks(
  request: BacklinkPreflightRequest,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<BacklinkPreflightResponse> {
  return apiRequest<BacklinkPreflightResponse>(
    '/metadata/references/preflight',
    {
      method: 'POST',
      signal,
      body: JSON.stringify({
        ...request,
        mode: request.mode ?? 'distributed',
        allow_partial: request.allow_partial ?? true,
      }),
    },
    client,
  )
}
