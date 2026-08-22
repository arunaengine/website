import { describe, expect, it } from 'vitest'
import { mapPreviewFindings } from './mapFindings'
import { CRATE_BASE_IRI } from './crateIri'
import type { ProfilePropertyRule, ProfileViolation } from '../profiles/types'
import type { ProfileValidationFinding } from '../api'

const NAME_RULE: ProfilePropertyRule = {
  id: 'rule-name',
  label: 'Name',
  description: '',
  kind: 'text',
  propertyUri: 'https://schema.org/name',
  valueName: 'name',
  obligation: 'required',
}

function finding(overrides: Partial<ProfileValidationFinding> = {}): ProfileValidationFinding {
  return {
    code: 'constraint_violation',
    severity: 'violation',
    focus_node: './',
    path: 'http://schema.org/name',
    rule: 'http://www.w3.org/ns/shacl#minCount',
    message: 'A required value is missing.',
    completeness: 'complete',
    ...overrides,
  }
}

describe('preview finding placement', () => {
  it('renders a root finding at its control and keeps the rest in the panel', () => {
    const mapped = mapPreviewFindings(
      [
        finding(),
        finding({ severity: 'info', message: 'A note.' }),
        finding({ path: 'http://schema.org/creator', message: 'Unmapped path.' }),
        finding({ focus_node: '#person-1', message: 'Other entity.' }),
      ],
      [NAME_RULE],
      [],
    )

    expect(mapped.inline).toEqual({
      name: [{
        ruleId: 'shacl:http://www.w3.org/ns/shacl#minCount',
        pointer: '/name',
        fieldId: 'name',
        message: 'A required value is missing.',
        severity: 'error',
      }],
    })
    expect(mapped.panel.map((item) => item.message)).toEqual(['A note.', 'Unmapped path.', 'Other entity.'])
  })

  it('resolves an absolute focus node back to the crate root', () => {
    const mapped = mapPreviewFindings([finding({ focus_node: CRATE_BASE_IRI })], [NAME_RULE], [])

    expect(Object.keys(mapped.inline)).toEqual(['name'])
    expect(mapped.panel).toEqual([])
  })

  it('drops findings the bespoke validator already reports at the field', () => {
    const bespoke: ProfileViolation[] = [{
      ruleId: 'profile:name',
      pointer: '/name',
      fieldId: 'name',
      message: 'Name is required.',
      severity: 'error',
    }]

    const mapped = mapPreviewFindings([finding()], [NAME_RULE], bespoke)

    expect(mapped.inline).toEqual({})
    expect(mapped.panel).toEqual([])
  })

  it('collapses repeated findings on the same field and severity', () => {
    const mapped = mapPreviewFindings([finding(), finding(), finding({ severity: 'warning' })], [NAME_RULE], [])

    expect(mapped.inline.name?.map((item) => item.severity)).toEqual(['error', 'warning'])
  })
})
