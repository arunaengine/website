import { ApiError, apiRequest, type ApiClientOptions } from './client'

export type ProfileValidationSeverity = 'violation' | 'warning' | 'info'
export type ProfileValidationCompleteness = 'complete' | 'incomplete'
export type ProfileValidationBackendState = 'not_profiled' | 'valid' | 'invalid' | 'stale'

export interface ProfileValidationFinding {
  code: string
  severity: ProfileValidationSeverity
  focus_node?: string | null
  path?: string | null
  rule: string
  message: string
  profile_revision?: string | null
  completeness: ProfileValidationCompleteness
}

export interface ProfileValidationCapabilitiesResponse {
  evaluator: string
  supported_constraints: string[]
  unsupported_constraint_policy: 'fail_closed'
  public_profile_iri_template: string
}

export interface ProfileValidationStatusResponse {
  document_id: string
  dataset_revision: string
  state: ProfileValidationBackendState
  profile_id?: string | null
  profile_iri?: string | null
  profile_revision?: string | null
  evaluator: string
  validated_at_ms?: number | null
  findings: ProfileValidationFinding[]
  completeness: ProfileValidationCompleteness
  stale_reason?: string | null
}

// RO-Crate structural violation, as served by the write path and the preview.
export interface RoCrateStructuralViolation {
  code: string
  message: string
  pointer?: string | null
  entity_id?: string | null
}

// A data entity of a public draft whose object is not readable by everyone.
// `permission_path` is the object's full permission path, present only when
// the caller may read the object; bucket and key are for display.
export interface RestrictedFile {
  entity_id: string
  group_id?: string
  permission_path?: string
  bucket?: string
  key?: string
}

export interface ProfileValidationPreviewResponse {
  // The verdict POST /metadata or PUT /metadata/{id}/rocrate would enforce.
  accepted: boolean
  state: Exclude<ProfileValidationBackendState, 'stale'>
  profile_id?: string | null
  profile_iri?: string | null
  profile_revision?: string | null
  evaluator: string
  findings: ProfileValidationFinding[]
  completeness: ProfileValidationCompleteness
  structural_violations: RoCrateStructuralViolation[]
  // An empty list is conclusive only when restricted_files_complete is true.
  restricted_files?: RestrictedFile[]
  restricted_files_complete?: boolean
}

// A node that predates a request field refuses it (deny_unknown_fields answers
// 422, older nodes 400) instead of ignoring it; that means "not supported yet",
// not "bad draft".
function unknownFieldRefusal(cause: unknown): boolean {
  if (!(cause instanceof ApiError) || (cause.status !== 400 && cause.status !== 422)) return false
  return /unknown|unexpected|unsupported/i.test(cause.message) && /group_id|public|field/i.test(cause.message)
}

/**
 * POST /metadata/profile/validation/preview: advisory validation of a draft
 * crate before it is saved. Rate limited like revalidate; 404/405 means the
 * node does not serve the preview at all. `groupId` names the owning group so
 * the node can resolve a group-scoped profile; `isPublic` asks which files a
 * public draft would expose without being readable. Both are retried once
 * without the fields when the node does not know them yet.
 */
export async function previewProfileValidation(
  rocrate: unknown,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
  groupId?: string,
  isPublic = false,
): Promise<ProfileValidationPreviewResponse> {
  const post = (body: Record<string, unknown>) =>
    apiRequest<ProfileValidationPreviewResponse>(
      '/metadata/profile/validation/preview',
      { method: 'POST', body: JSON.stringify(body), signal },
      client,
    )
  // Newest field first: each refusal drops one more field, `public` before `group_id`.
  const bodies: Array<Record<string, unknown>> = [{ rocrate }]
  if (groupId) bodies.unshift({ rocrate, group_id: groupId })
  if (isPublic) bodies.unshift({ ...bodies[0], public: true })
  for (let index = 0; ; index++) {
    try {
      return await post(bodies[index])
    } catch (cause) {
      if (index === bodies.length - 1 || !unknownFieldRefusal(cause)) throw cause
    }
  }
}

export function profileValidationFindings(error: unknown): ProfileValidationFinding[] {
  const findings = error instanceof ApiError ? error.details?.findings : undefined
  if (!Array.isArray(findings)) return []
  return findings.filter((finding): finding is ProfileValidationFinding => {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) return false
    const value = finding as Record<string, unknown>
    return typeof value.code === 'string'
      && (value.severity === 'violation' || value.severity === 'warning' || value.severity === 'info')
      && typeof value.rule === 'string'
      && typeof value.message === 'string'
      && (value.completeness === 'complete' || value.completeness === 'incomplete')
  })
}
