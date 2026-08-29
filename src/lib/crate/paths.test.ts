import { describe, expect, it } from 'vitest'
import type { ApiRole } from '@/lib/api'
import { documentPrefixes, joinPath, pathPrefixOptions, splitPath, writablePrefixes } from './paths'

const REALM = 'realm-1'
const GROUP = 'group-1'

function role(permissions: Record<string, string>): ApiRole {
  return { role_id: 'r', name: 'r', permissions }
}

function scoped(suffix: string): string {
  return `/${REALM}/g/${GROUP}/${suffix}`
}

describe('writablePrefixes', () => {
  it('reads the meta grants out of the role paths', () => {
    const roles = [
      role({ [scoped('meta/projects/**')]: 'WRITE', [scoped('meta/archive/**')]: 'read' }),
      role({ [scoped('data/**')]: 'write' }),
    ]
    expect(writablePrefixes(roles, REALM, GROUP)).toEqual(['projects'])
  })

  it('maps a whole-group or whole-meta grant to the root', () => {
    expect(writablePrefixes([role({ [scoped('**')]: 'write' })], REALM, GROUP)).toEqual([''])
    expect(writablePrefixes([role({ [scoped('meta/**')]: 'write' })], REALM, GROUP)).toEqual([''])
  })

  it('ignores grants on one exact document and on other groups', () => {
    const roles = [role({ [scoped('meta/projects/one')]: 'write', '/realm-1/g/other/meta/**': 'write' })]
    expect(writablePrefixes(roles, REALM, GROUP)).toEqual([])
  })
})

describe('documentPrefixes', () => {
  it('lists every folder and ancestor, sorted, without the reserved ones', () => {
    expect(documentPrefixes(['datasets/a', 'datasets/deep/b', 'profiles/x', 'runs/y', 'top'])).toEqual([
      'datasets',
      'datasets/deep',
    ])
  })
})

describe('pathPrefixOptions', () => {
  it('preselects the first narrower grant and keeps the root last', () => {
    const result = pathPrefixOptions({
      roles: [role({ [scoped('meta/projects/**')]: 'write', [scoped('meta/**')]: 'write' })],
      realmId: REALM,
      groupId: GROUP,
      documentPaths: ['projects/a', 'datasets/b'],
    })
    expect(result.options.map((option) => option.value)).toEqual(['projects', 'datasets', ''])
    expect(result.options.at(-1)?.label).toBe('Group root')
    expect(result.preselected).toBe('projects')
  })

  it('falls back to the group root when nothing narrower exists', () => {
    const result = pathPrefixOptions({
      roles: [role({ [scoped('meta/**')]: 'write' })],
      realmId: REALM,
      groupId: GROUP,
      documentPaths: [],
    })
    expect(result.options.map((option) => option.value)).toEqual([''])
    expect(result.preselected).toBe('')
  })

  it('offers only the folders a narrower grant covers', () => {
    // A folder outside the grant would only earn a 403 on save.
    const result = pathPrefixOptions({
      roles: [role({ [scoped('meta/projects/**')]: 'write' })],
      realmId: REALM,
      groupId: GROUP,
      documentPaths: ['projects/sub/a', 'datasets/b'],
    })
    expect(result.options.map((option) => option.value)).toEqual(['projects', 'projects/sub'])
    expect(result.preselected).toBe('projects')
  })

  it('offers every folder when no grant is known', () => {
    const result = pathPrefixOptions({ roles: [], realmId: REALM, groupId: GROUP, documentPaths: ['datasets/b'] })
    expect(result.options.map((option) => option.value)).toEqual(['datasets', ''])
    expect(result.preselected).toBe('')
  })
})

describe('path parts', () => {
  it('joins and splits a prefix and a slug', () => {
    expect(joinPath('projects', 'reads-2026')).toBe('projects/reads-2026')
    expect(joinPath('', 'reads-2026')).toBe('reads-2026')
    expect(joinPath('projects/', '/reads')).toBe('projects/reads')
    expect(splitPath('projects/deep/reads')).toEqual({ prefix: 'projects/deep', slug: 'reads' })
    expect(splitPath('reads')).toEqual({ prefix: '', slug: 'reads' })
  })
})
