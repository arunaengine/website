// The problems the node reported for a draft, in one shape: the check response
// and the issues a failed write returned collapse into the same list, so the
// check panel groups exactly the same things.

import type { ProfileValidationPreviewResponse } from '@/lib/api'

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
