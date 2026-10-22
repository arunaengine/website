import { describe, expect, it } from 'vitest'
import { mappingProblem, movePlan, toMapping, toRule } from './bucketMappings'

describe('mappings', () => {
  it('round-trips the stored discovery rules', () => {
    expect(toMapping({ pattern: '*.faa', folder: 'proteins/' })).toEqual({ aruna: 'proteins/{name}', storage: '*.faa' })
    expect(toRule({ aruna: ' foobar/{name} ', storage: 'lars/{name}' })).toEqual({ pattern: 'lars/{name}', folder: 'foobar/' })
  })

  it('refuses paths the node cannot read', () => {
    expect(mappingProblem({ aruna: 'proteins/', storage: '*.faa' })).toContain('/{name}')
    expect(mappingProblem({ aruna: 'p/{name}', storage: 'lars/x' })).toContain('folder/{name}')
    expect(mappingProblem({ aruna: 'p/{name}', storage: '{name}.faa' })).toContain('*.faa')
    expect(mappingProblem({ aruna: 'p/{name}', storage: '*.faa' })).toBeNull()
  })

  it('builds the move of files already in Aruna', () => {
    expect(movePlan({ aruna: 'proteins/{name}', storage: '*.faa' })).toEqual({
      from: '',
      pattern: '*.faa',
      target: 'proteins/{dir}{name}',
      subfolders: true,
    })
    expect(movePlan({ aruna: 'foobar/{name}', storage: 'lars/{name}' })).toEqual({
      from: 'lars/',
      pattern: '*',
      target: 'foobar/{dir}{name}',
      subfolders: true,
    })
  })
})
