import { describe, expect, it } from 'vitest'
import type { ApiRole } from '@/lib/api'
import {
  coveringRules,
  dataRoot,
  managedRole,
  publicUrl,
  rulesInBucket,
  targetPath,
  withGrants,
  withoutGrants,
} from '@/lib/publicAccess'

const root = dataRoot('realm-1', 'g-1', 'node-1')

function role(permissions: Record<string, string>, name = 'public', isPublic = true): ApiRole {
  return { role_id: `r-${name}`, name, permissions, public: isPublic }
}

describe('public access paths', () => {
  it('shapes bucket, folder and file targets like the node does', () => {
    expect(root).toBe('/realm-1/g/g-1/data/node-1')
    expect(targetPath(root, { kind: 'bucket', bucket: 'reef', key: '' })).toBe(`${root}/reef/**`)
    expect(targetPath(root, { kind: 'folder', bucket: 'reef', key: 'raw/' })).toBe(`${root}/reef/raw/**`)
    expect(targetPath(root, { kind: 'file', bucket: 'reef', key: 'raw/reads.fastq' })).toBe(
      `${root}/reef/raw/reads.fastq`,
    )
  })

  it('finds the public rules that cover a path', () => {
    const roles = [
      role({ [`${root}/reef/raw/**`]: 'READ' }),
      role({ [`${root}/reef/**`]: 'write' }, 'admin', false),
      role({ [`${root}/reef/other.txt`]: 'read' }, 'viewers'),
    ]

    expect(coveringRules(roles, `${root}/reef/raw/reads.fastq`)).toEqual([`${root}/reef/raw/**`])
    expect(coveringRules(roles, `${root}/reef/raw/**`)).toEqual([`${root}/reef/raw/**`])
    expect(coveringRules(roles, `${root}/reef/rawer/x`)).toEqual([])
    expect(coveringRules(roles, `${root}/reef/other.txt`)).toEqual([`${root}/reef/other.txt`])
    expect(coveringRules(roles, `${root}/reef/**`)).toEqual([])
  })

  it('manages only the public role named public', () => {
    const named = role({})
    expect(managedRole([role({}, 'viewers'), named])).toBe(named)
    expect(managedRole([role({}, 'public', false)])).toBeNull()
  })

  it('merges grants and keeps every rule read', () => {
    const next = withGrants({ [`${root}/reef/a`]: 'READ', [`${root}/reef/b`]: 'write' }, [
      `${root}/reef/c/**`,
      `${root}/reef/a`,
    ])
    expect(next).toEqual({ [`${root}/reef/a`]: 'read', [`${root}/reef/c/**`]: 'read' })
  })

  it('removes a folder rule with everything below it but not a broader rule', () => {
    const rules = {
      [`${root}/reef/**`]: 'read',
      [`${root}/reef/raw/**`]: 'read',
      [`${root}/reef/raw/reads.fastq`]: 'read',
      [`${root}/reef/raw.txt`]: 'read',
    }
    expect(Object.keys(withoutGrants(rules, [`${root}/reef/raw/**`]))).toEqual([
      `${root}/reef/**`,
      `${root}/reef/raw.txt`,
    ])
    expect(Object.keys(withoutGrants(rules, [`${root}/reef/raw/reads.fastq`]))).toEqual([
      `${root}/reef/**`,
      `${root}/reef/raw/**`,
      `${root}/reef/raw.txt`,
    ])
  })

  it('lists the rules inside one bucket as targets', () => {
    const entries = rulesInBucket(
      role({
        [`${root}/reef/raw/**`]: 'read',
        [`${root}/reef/**`]: 'read',
        [`${root}/reef/notes.md`]: 'read',
        [`${root}/other/**`]: 'read',
      }),
      root,
      'reef',
    )
    expect(entries.map((entry) => entry.target)).toEqual([
      { kind: 'bucket', bucket: 'reef', key: '' },
      { kind: 'file', bucket: 'reef', key: 'notes.md' },
      { kind: 'folder', bucket: 'reef', key: 'raw/' },
    ])
    expect(rulesInBucket(null, root, 'reef')).toEqual([])
  })
})

describe('public address', () => {
  it('builds path-style addresses with encoded segments', () => {
    const endpoint = 'https://s3.node-1.example/'
    expect(publicUrl(endpoint, { kind: 'bucket', bucket: 'reef', key: '' })).toBe('https://s3.node-1.example/reef/')
    expect(publicUrl(endpoint, { kind: 'folder', bucket: 'reef', key: 'raw data/' })).toBe(
      'https://s3.node-1.example/reef/raw%20data/',
    )
    expect(publicUrl(endpoint, { kind: 'file', bucket: 'reef', key: 'raw/a#1.txt' })).toBe(
      'https://s3.node-1.example/reef/raw/a%231.txt',
    )
  })
})
