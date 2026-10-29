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

// Exactly one of the two names a target: the content identity of stored bytes, or the
// `s3://bucket/key` location of reference and pending versions, whose bytes were never read.
export interface BacklinkPreflightTargetResult {
  content_w3id: string | null
  location_iri: string | null
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

/** The excluded form a location target brings: a stated limit of the lookup, not a failure. */
export const UNREAD_CONTENT_FORM = 'unread_content_w3id'

/** What names a target, whichever of the two it carries. */
export function targetIdentity(target: Pick<BacklinkPreflightTargetResult, 'content_w3id' | 'location_iri'>): string {
  return target.content_w3id ?? target.location_iri ?? ''
}

/** The bucket and key an `s3://bucket/key` location names; null for anything else. */
export function locationOf(iri: string | null): { bucket: string; key: string } | null {
  const match = iri?.match(/^s3:\/\/([^/]+)\/(.+)$/)
  return match ? { bucket: match[1], key: match[2] } : null
}

export function exactFileBacklinkPreflight(
  response: BacklinkPreflightResponse,
  bucket: string,
  key: string,
): BacklinkPreflightResponse {
  // A location target names its key as well as listing its versions.
  const named = (target: BacklinkPreflightTargetResult) => locationOf(target.location_iri)
  const exact = response.targets.every((target) => {
    const location = named(target)
    return (
      (!location || location.bucket !== bucket || location.key === key) &&
      target.targeted_versions.every((version) => version.bucket !== bucket || version.key === key)
    )
  })
  return {
    ...response,
    targets: response.targets.flatMap((target) => {
      const targetedVersions = target.targeted_versions.filter(
        (location) => location.bucket === bucket && location.key === key,
      )
      const location = named(target)
      const thisFile = location?.bucket === bucket && location.key === key
      return targetedVersions.length || thisFile ? [{ ...target, targeted_versions: targetedVersions }] : []
    }),
    complete: exact && response.complete,
    coverage: {
      ...response.coverage,
      queried_scope: 'selected_bucket_keys',
      target_resolution_complete: exact && response.coverage.target_resolution_complete,
      path_style_endpoint_coverage_complete:
        exact && response.coverage.path_style_endpoint_coverage_complete,
      realm_coverage_complete: exact && response.coverage.realm_coverage_complete,
    },
  }
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
