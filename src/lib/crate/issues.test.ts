import { describe, expect, it } from 'vitest'
import { collectIssues, isNodeRejection, rejectionIssues } from './issues'
import { ApiError, type ProfileValidationPreviewResponse } from '@/lib/api'

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

describe('rejectionIssues', () => {
  it('lifts violations and findings out of a refused write', () => {
    const error = new ApiError(400, 'Validation failed', 'Validation failed', {
      violations: [{ code: 'missing_root', message: 'No root dataset.', pointer: '/@graph' }],
      findings: [{
        code: 'constraint_violation',
        severity: 'violation',
        rule: 'sh:minCount',
        message: 'A required value is missing.',
        focus_node: '#person-ada',
        path: 'affiliation',
        completeness: 'complete',
      }],
    })

    expect(rejectionIssues(error)).toEqual([
      { code: 'missing_root', message: 'No root dataset.', entityId: undefined, path: '/@graph', severity: 'violation' },
      {
        code: 'constraint_violation',
        message: 'A required value is missing.',
        entityId: '#person-ada',
        path: 'affiliation',
        severity: 'violation',
      },
    ])
  })

  it('turns a bare 400 into one issue carrying the code', () => {
    // The node drops the reason for a refused crate; the code must still show.
    const error = new ApiError(400, 'Bad request', 'Bad request', { error: 'Bad request', code: 'Bad request' })

    expect(rejectionIssues(error)).toEqual([{ code: 'Bad request', message: 'Bad request', severity: 'violation' }])
    expect(isNodeRejection(error)).toBe(true)
  })

  it('appends the detail line the node sent', () => {
    const error = new ApiError(400, 'Bad request', 'Bad request', { details: 'RO-Crate version mismatch' })

    expect(rejectionIssues(error)[0].message).toBe('Bad request: RO-Crate version mismatch')
  })

  it('reports nothing for an outage or a plain error', () => {
    expect(rejectionIssues(new ApiError(503, 'Service unavailable'))).toEqual([])
    expect(rejectionIssues(new Error('offline'))).toEqual([])
    expect(isNodeRejection(new ApiError(503, 'Service unavailable'))).toBe(false)
  })
})
