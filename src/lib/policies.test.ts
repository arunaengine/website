import { describe, expect, it } from 'vitest'
import {
  MAX_POLICY_EXPRESSION_BYTES,
  emptyPolicy,
  expressionBytes,
  policyProblems,
  scopeLabel,
  toWirePolicy,
  traceLabel,
  type Policy,
} from './policies'

function policy(overrides: Partial<Policy> = {}): Policy {
  return { name: 'no-anon-writes', kind: 'deny', expression: 'anonymous', enabled: true, ...overrides }
}

describe('policyProblems', () => {
  it('accepts a complete policy', () => {
    expect(policyProblems(policy())).toEqual([])
  })

  it('requires a name and an expression', () => {
    const fields = policyProblems(emptyPolicy()).map((p) => p.field)
    expect(fields).toContain('name')
    expect(fields).toContain('expression')
  })

  it('rejects an oversized expression', () => {
    const problems = policyProblems(policy({ expression: 'a'.repeat(MAX_POLICY_EXPRESSION_BYTES + 1) }))
    expect(problems).toHaveLength(1)
    expect(problems[0].field).toBe('expression')
  })

  it('measures the cap in bytes, not characters', () => {
    // The backend caps encoded bytes, so multi-byte characters count for more.
    const expression = 'é'.repeat(MAX_POLICY_EXPRESSION_BYTES / 2 + 1)
    expect(expression.length).toBeLessThan(MAX_POLICY_EXPRESSION_BYTES)
    expect(expressionBytes(expression)).toBeGreaterThan(MAX_POLICY_EXPRESSION_BYTES)
    expect(policyProblems(policy({ expression }))).toHaveLength(1)
  })

  it('checks the guard too', () => {
    const problems = policyProblems(policy({ when: 'a'.repeat(MAX_POLICY_EXPRESSION_BYTES + 1) }))
    expect(problems.map((p) => p.field)).toEqual(['when'])
  })
})

describe('toWirePolicy', () => {
  it('drops an empty guard to null', () => {
    expect(toWirePolicy(policy({ when: '   ' })).when).toBeNull()
  })

  it('omits a draft policy_id', () => {
    expect('policy_id' in toWirePolicy(policy())).toBe(false)
  })

  it('keeps a stored policy_id', () => {
    expect(toWirePolicy(policy({ policy_id: '01J' })).policy_id).toBe('01J')
  })

  it('trims the name but never the expression', () => {
    const wire = toWirePolicy(policy({ name: '  spaced  ', expression: '  a == b  ' }))
    expect(wire.name).toBe('spaced')
    expect(wire.expression).toBe('  a == b  ')
  })
})

describe('scopeLabel', () => {
  it('passes realm through', () => {
    expect(scopeLabel('realm')).toBe('realm')
  })

  it('shortens a group ulid', () => {
    expect(scopeLabel('group(01J0000000000000000000GRP)')).toBe('group 01J00000…')
  })
})

describe('traceLabel', () => {
  it('spells out why a disabled policy did nothing', () => {
    expect(traceLabel('SkippedDisabled')).toBe('skipped (disabled)')
  })

  it('marks an error as denying', () => {
    expect(traceLabel('Error')).toBe('error (denies)')
  })
})
