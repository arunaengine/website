// The problems the node reported for a draft, in one shape: the check response
// and the issues a failed write returned collapse into the same list, so the
// check panel groups exactly the same things.

import {
  ApiError,
  profileValidationFindings,
  type ProfileValidationPreviewResponse,
  type RoCrateStructuralViolation,
} from '@/lib/api'

export type IssueSeverity = 'violation' | 'warning' | 'info'

export interface CheckIssue {
  key: string
  code: string
  message: string
  entityId: string
  path?: string | null
  severity: IssueSeverity
}

export interface WriteIssue {
  code?: string
  message: string
  entityId?: string | null
  path?: string | null
  severity?: string
}

const ROOT_ID = './'

function severityOf(value: string | undefined): IssueSeverity {
  return value === 'warning' || value === 'info' ? value : 'violation'
}

export function collectIssues(
  result: ProfileValidationPreviewResponse | null | undefined,
  writeIssues: WriteIssue[] = [],
): CheckIssue[] {
  return [
    ...(result?.structural_violations ?? []).map((issue) => ({
      key: `structural:${issue.code}:${issue.pointer ?? ''}`,
      code: issue.code,
      message: issue.message,
      entityId: issue.entity_id || ROOT_ID,
      path: issue.pointer,
      severity: 'violation' as const,
    })),
    ...(result?.findings ?? []).map((issue) => ({
      key: `finding:${issue.code}:${issue.focus_node ?? ''}:${issue.path ?? ''}`,
      code: issue.code,
      message: issue.message,
      entityId: issue.focus_node || ROOT_ID,
      path: issue.path,
      severity: severityOf(issue.severity),
    })),
    ...writeIssues.map((issue, index) => ({
      key: `write:${issue.code ?? index}:${issue.entityId ?? ''}:${issue.path ?? ''}`,
      code: issue.code ?? 'write',
      message: issue.message,
      entityId: issue.entityId || ROOT_ID,
      path: issue.path,
      severity: severityOf(issue.severity),
    })),
  ]
}

/** True for a request the node refused outright. */
export function isNodeRejection(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 400
}

function structuralViolations(error: ApiError): RoCrateStructuralViolation[] {
  const violations = error.details?.violations
  if (!Array.isArray(violations)) return []
  return violations.filter((value): value is RoCrateStructuralViolation =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && typeof (value as Record<string, unknown>).message === 'string'))
}

/**
 * Everything a refused write or preview said, as write issues. A 400 without
 * violations or findings still becomes one issue, so the node's error and code
 * reach the drawer instead of a bare status line.
 */
export function rejectionIssues(error: unknown): WriteIssue[] {
  if (!(error instanceof ApiError)) return []
  const issues: WriteIssue[] = [
    ...structuralViolations(error).map((issue) => ({
      code: issue.code,
      message: issue.message,
      entityId: issue.entity_id,
      path: issue.pointer,
      severity: 'violation',
    })),
    ...profileValidationFindings(error).map((finding) => ({
      code: finding.code,
      message: finding.message,
      entityId: finding.focus_node,
      path: finding.path,
      severity: finding.severity,
    })),
  ]
  if (issues.length || error.status !== 400) return issues
  const detail = typeof error.details?.details === 'string' ? error.details.details : ''
  return [{
    code: error.code ?? 'bad_request',
    message: detail ? `${error.message}: ${detail}` : error.message,
    severity: 'violation',
  }]
}
