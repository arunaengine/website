import { describe, expect, it } from 'vitest'
import { collectIssues, issueCounts, sectionOf } from './issues'
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

describe('sectionOf', () => {
  it('routes the root, a part and a context entity to their sections', () => {
    const parts = new Set(['s3://bucket/reads.fastq'])
    expect(sectionOf('./', parts)).toBe('basics')
    expect(sectionOf('s3://bucket/reads.fastq', parts)).toBe('parts')
    expect(sectionOf('#person-ada', parts)).toBe('context')
  })
})

describe('issueCounts', () => {
  it('counts problems per section', () => {
    const issues = collectIssues(response({
      structural_violations: [
        { code: 'a', message: 'One.', entity_id: './', pointer: null },
        { code: 'b', message: 'Two.', entity_id: '#person-ada', pointer: null },
        { code: 'c', message: 'Three.', entity_id: '#person-ada', pointer: null },
      ],
    }))

    expect(issueCounts(issues)).toEqual({ basics: 1, context: 2, parts: 0 })
  })
})
