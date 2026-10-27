import { describe, expect, it } from 'vitest'
import { emptyRule, parserOf, PRESETS, ruleProblem, withPreset } from './identifierLinks'

describe('identifier links', () => {
  it('adds each preset once', () => {
    const once = withPreset([], 'BioSample')
    expect(once).toHaveLength(1)
    expect(withPreset(once, 'BioSample')).toHaveLength(1)
    expect(withPreset(once, 'Unknown')).toHaveLength(1)
    expect(withPreset(once, 'Zenodo record')[1].target).toBe('source_url')
  })

  it('names the first problem of a rule', () => {
    const rule = { ...PRESETS[0] }
    expect(ruleProblem(rule)).toBeNull()
    expect(ruleProblem({ ...rule, pattern: '(GC[AF]_\\d+)' })).toMatch(/part named id/)
    expect(ruleProblem({ ...rule, url_template: 'https://x.org/' })).toMatch(/\{id\}/)
    expect(ruleProblem({ ...rule, url_template: 'javascript:{id}' })).toMatch(/https/)
    expect(ruleProblem(emptyRule())).toMatch(/name/)
    expect(PRESETS.every((preset) => ruleProblem(preset) === null)).toBe(true)
  })

  it('clears the parser when no rule is left', () => {
    expect(parserOf([])).toBeNull()
    expect(parserOf([{ ...PRESETS[0], name: ' BioSample ' }])?.rules[0].name).toBe('BioSample')
  })
})
