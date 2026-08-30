import { describe, expect, it } from 'vitest'
import { collectIssues, isNodeRejection, rejectionIssues, resolveEntityId, VALIDATION_GRAPH_IRI } from './issues'
import { addEntity, newDraft, updateValue, type CrateDraft } from '@/lib/crate/editor'
import { CRATE_BASE_IRI } from '@/lib/shacl/crateIri'
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

function draft(): CrateDraft {
  const named = updateValue(newDraft(), './', 'name', 0, 'Example dataset')
  const person = addEntity(named, { type: 'Person', name: 'Ada Example', id: '#person' })
  return addEntity(person.draft, { type: 'File', id: 'data.csv' }).draft
}

describe('resolveEntityId', () => {
  it('reads the validation graph IRI as the root', () => {
    expect(resolveEntityId(draft(), VALIDATION_GRAPH_IRI)).toEqual({ id: './', resolved: true })
    expect(resolveEntityId(draft(), `<${VALIDATION_GRAPH_IRI}>`)).toEqual({ id: './', resolved: true })
  })

  it('keeps a crate-local id the draft carries', () => {
    expect(resolveEntityId(draft(), '#person')).toEqual({ id: '#person', resolved: true })
  })

  it('drops the anchor of a relative file id', () => {
    expect(resolveEntityId(draft(), './data.csv')).toEqual({ id: 'data.csv', resolved: true })
    expect(resolveEntityId(draft(), 'https://craqle.invalid/data.csv')).toEqual({ id: 'data.csv', resolved: true })
  })

  it('reads the legacy portal base as the root', () => {
    expect(resolveEntityId(draft(), CRATE_BASE_IRI)).toEqual({ id: './', resolved: true })
    expect(resolveEntityId(draft(), `${CRATE_BASE_IRI}#person`)).toEqual({ id: '#person', resolved: true })
  })

  it('leaves an id no entity carries unresolved', () => {
    expect(resolveEntityId(draft(), 'https://orcid.org/0000-0002')).toEqual({
      id: 'https://orcid.org/0000-0002',
      resolved: false,
    })
  })
})

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
      draft(),
    )

    expect(issues.map((issue) => [issue.entityId, issue.severity, issue.resolved])).toEqual([
      ['./', 'violation', true],
      ['#person-ada', 'warning', false],
      ['./', 'violation', true],
    ])
  })

  it('names the property a required-property violation is about', () => {
    const issues = collectIssues(
      response({
        structural_violations: [{
          code: 'missing_required_property',
          message: 'missing required property `schema:description` on entity `https://craqle.invalid/validation/document`',
          entity_id: VALIDATION_GRAPH_IRI,
          pointer: '/@graph/0',
        }],
      }),
      [],
      draft(),
    )

    expect(issues[0]).toMatchObject({
      entityId: './',
      resolved: true,
      path: 'description',
      message: 'Missing required property: description',
    })
    expect(issues[0].detail).toContain('schema:description')
  })

  it('puts the entity name where the node wrote its IRI', () => {
    const issues = collectIssues(
      response({
        structural_violations: [{
          code: 'invalid_date',
          message: `\`${VALIDATION_GRAPH_IRI}\` has no usable datePublished.`,
          entity_id: VALIDATION_GRAPH_IRI,
          pointer: null,
        }],
      }),
      [],
      draft(),
    )

    expect(issues[0].message).toBe('Example dataset has no usable datePublished.')
    expect(issues[0].detail).toContain(VALIDATION_GRAPH_IRI)
  })

  it('reports nothing without a result', () => {
    expect(collectIssues(null, [], draft())).toEqual([])
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
