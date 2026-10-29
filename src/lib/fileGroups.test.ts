import { describe, expect, it } from 'vitest'
import { FOLDER_GROUP_MIN, groupFiles } from './fileGroups'
import type { RunCrateFileRef } from './runCrate'

const file = (bucket: string, key: string, size?: string, extra: Partial<RunCrateFileRef> = {}): RunCrateFileRef => ({
  id: `${bucket}/${key}`,
  name: key,
  contentSize: size,
  contentUrl: `s3://${bucket}/${key}`,
  ...extra,
})
const DATABASE = { id: '#bucket-metadata-1', kind: 'database' as const, name: 'Bakta database (light)', links: [] }

describe('run file groups', () => {
  it('keeps the files of one database together across folders and sums their size', () => {
    const files = [file('db', 'a/x.bin', '10', { partOf: [DATABASE] }), file('db', 'b/y.bin', '5', { partOf: [DATABASE] }), file('laptop', 'genome.fasta', '7')]
    const groups = groupFiles(files)

    expect(groups.map((group) => group.files.length)).toEqual([2, 1])
    expect(groups[0]).toMatchObject({ database: DATABASE, folder: '', bytes: { total: 15, complete: true } })
  })

  it('groups a crowded bucket by its shared folder and keeps a few files single', () => {
    const many = Array.from({ length: FOLDER_GROUP_MIN }, (_, index) => file('laptop', `results/bakta/f${index}.tsv`, '1'))
    const few = [file('out', 'a.tsv', '1'), file('out', 'b.tsv')]
    const groups = groupFiles([...many, ...few])

    expect(groups[0]).toMatchObject({ bucket: 'laptop', folder: 'results/bakta/' })
    expect(groups[0]!.files).toHaveLength(FOLDER_GROUP_MIN)
    expect(groups.slice(1).map((group) => group.files.map((entry) => entry.name))).toEqual([['a.tsv'], ['b.tsv']])
    expect(groups[2]!.bytes.complete).toBe(false)
  })

  it('keeps files of different releases apart and metadata of different buckets apart', () => {
    const OLD = { id: 'release-old', kind: 'release' as const, name: 'Release old', version: 'old', links: [] }
    const NEW = { id: 'release-new', kind: 'release' as const, name: 'Release new', version: 'new', links: [] }
    const files = [
      file('db', 'a.bin', '1', { partOf: [DATABASE, OLD] }),
      file('db', 'b.bin', '1', { partOf: [DATABASE, OLD] }),
      file('db', 'c.bin', '1', { partOf: [DATABASE, NEW] }),
      file('other', 'd.bin', '1', { partOf: [DATABASE] }),
      file('other', 'e.bin', '1', { partOf: [DATABASE] }),
    ]
    const groups = groupFiles(files)

    expect(groups.map((group) => [group.release?.version ?? null, group.bucket, group.files.length])).toEqual([
      ['old', 'db', 2],
      ['new', 'db', 1],
      [null, 'other', 2],
    ])
  })
})

