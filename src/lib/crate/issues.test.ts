import { describe, expect, it } from 'vitest'
import { collectIssues } from './issues'
import type { ProfileValidationPreviewResponse } from '@/lib/api'

function response(overrides: Partial<ProfileValidationPreviewResponse> = {}): ProfileValidationPreviewResponse {
  return {
    accepted: false,
    state: 'invalid',
    evaluator: 'craqle',
    findings: [],
    completeness: 'complete',
    structural_violations: [],
    ...overrides,
  }
}

describe('collectIssues', () => {
  it('merges structural, profile and write issues onto their entities', () => {
    const issues = collectIssues(
      response({
        structural_violations: [{ code: 'missing_root', message: 'No root dataset.', entity_id: null, pointer: '/@graph' }],
        findings: [{
          code: 'constraint_violation',
          severity: 'warning',
          rule: 'sh:minCount',
          message: 'A recommended value is missing.',
          focus_node: '#person-ada',
          path: 'affiliation',
          completeness: 'complete',
        }],
      }),
      [{ code: 'write', message: 'The path is taken.', entityId: './' }],
    )

    expect(issues.map((issue) => [issue.entityId, issue.severity])).toEqual([
      ['./', 'violation'],
      ['#person-ada', 'warning'],
      ['./', 'violation'],
    ])
  })

  it('reports nothing without a result', () => {
    expect(collectIssues(null)).toEqual([])
  })
})
