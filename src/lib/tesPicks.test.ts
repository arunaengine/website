import { describe, expect, it } from 'vitest'
import { answerEntries, badReference, expandDataRefEntry, nativeInput, pickedEntries, resultsKey } from './tes'

const V1 = '01K8W1B3D5F7H9KMQ1S3V5X7Z1'
const V2 = '01K8W1B3D5F7H9KMQ1S3V5X7Z2'

describe('picked run inputs', () => {
  it('pins files to their node and exact version', () => {
    const entries = pickedEntries({ realmId: 'realm', nodeId: 'node-b', bucket: 'bakta db', local: false }, [{ key: 'db/a b.fna', versionId: V1, name: 'a b.fna' }], [], '/inputs/')

    expect(entries).toEqual([{ kind: 'file', url: `arn:aruna:realm:node-b:s3/bakta db/db/a%20b.fna@${V1}`, path: '/inputs/a b.fna', name: 'a b.fna' }])
    expect(expandDataRefEntry(entries[0])[0]).toMatchObject({ type: 'FILE', url: entries[0].kind === 'file' ? entries[0].url : '' })
  })

  it('makes a folder of this node one DIRECTORY input', () => {
    const [entry] = pickedEntries({ realmId: 'realm', nodeId: 'node-a', bucket: 'db', local: true }, [], [{ prefix: 'db/6.0/', name: '6.0' }], '/data/')

    expect(expandDataRefEntry(entry)).toEqual([{ name: '6.0', url: 's3://db/db/6.0/', path: '/data/6.0', type: 'DIRECTORY' }])
  })

  it('pins every listed file of a folder on another node', () => {
    const folder = { prefix: 'db/6.0/', name: '6.0', files: [{ key: 'db/6.0/x.tsv', versionId: V1 }, { key: 'db/6.0/sub/y.tsv', versionId: V2 }] }
    const entries = pickedEntries({ realmId: 'realm', nodeId: 'node-b', bucket: 'db', local: false }, [], [folder], '/data/')

    expect(entries.map((entry) => (entry.kind === 'file' ? [entry.path, entry.url] : []))).toEqual([
      ['/data/6.0/x.tsv', `arn:aruna:realm:node-b:s3/db/db/6.0/x.tsv@${V1}`],
      ['/data/6.0/sub/y.tsv', `arn:aruna:realm:node-b:s3/db/db/6.0/sub/y.tsv@${V2}`],
    ])
  })
})

describe('results below a linked folder', () => {
  it('puts each capture under results and the run name', () => {
    expect(resultsKey('genomes/', 'bakta-sample7', 'sample7.gff3')).toBe('genomes/results/bakta-sample7/sample7.gff3')
    expect(resultsKey('genomes', 'run', 'out/')).toBe('genomes/results/run/out/')
    expect(resultsKey('', 'run', 'a.txt')).toBe('results/run/a.txt')
  })
})

describe('pinned inputs on a local run', () => {
  it('turns a version ARN into the url, node and version a native job takes', () => {
    const input = { name: 'a b.fna', path: '/in/a b.fna', url: `arn:aruna:realm:node-b:s3/db/x/a%20b.fna@${V1}` }
    expect(nativeInput(input)).toEqual({ ...input, url: 's3://db/x/a b.fna', source_node_id: 'node-b', version_id: V1 })
    expect(nativeInput({ path: '/in/c', url: 's3://lab/c' })).toEqual({ path: '/in/c', url: 's3://lab/c' })
  })
})

describe('answers to an asked input', () => {
  it('puts one file at the asked path', () => {
    const [entry] = answerEntries('/data/genome.fna', [{ kind: 'file', url: 's3://lab/g7.fna', path: '/inputs/g7.fna', name: 'g7.fna' }])
    expect(entry).toMatchObject({ path: '/data/genome.fna' })
  })

  it('keeps every file of a folder from another node below the asked directory', () => {
    const files = pickedEntries({ realmId: 'realm', nodeId: 'node-b', bucket: 'db', local: false }, [], [
      { prefix: 'db/6.0/', name: '6.0', files: [{ key: 'db/6.0/x.tsv', versionId: V1 }, { key: 'db/6.0/sub/y.tsv', versionId: V2 }] },
    ], '/data/')
    expect(answerEntries('/db', files).map((entry) => (entry.kind === 'file' ? entry.path : ''))).toEqual(['/db/x.tsv', '/db/sub/y.tsv'])
  })

  it('makes a folder of this node the asked directory', () => {
    const [entry] = answerEntries('/db', [{ kind: 'folder', bucket: 'db', prefix: 'db/6.0/', name: '6.0', basePath: '/data/6.0/', files: [], directory: true }])
    expect(entry).toMatchObject({ basePath: '/db/' })
  })
})

describe('answers with several folders', () => {
  it('keeps the folder names so equal file names stay apart', () => {
    const files = pickedEntries({ realmId: 'realm', nodeId: 'node-b', bucket: 'db', local: false }, [], [
      { prefix: 'a/first/', name: 'first', files: [{ key: 'a/first/x.tsv', versionId: V1 }] },
      { prefix: 'a/second/', name: 'second', files: [{ key: 'a/second/x.tsv', versionId: V2 }] },
    ], '/data/')
    expect(answerEntries('/db', files).map((entry) => (entry.kind === 'file' ? entry.path : ''))).toEqual(['/db/first/x.tsv', '/db/second/x.tsv'])
    const folders = answerEntries('/db', [
      { kind: 'folder', bucket: 'db', prefix: 'first/', name: 'first', basePath: '/data/first/', files: [], directory: true },
      { kind: 'folder', bucket: 'db', prefix: 'second/', name: 'second', basePath: '/data/second/', files: [], directory: true },
    ])
    expect(folders.map((entry) => (entry.kind === 'folder' ? entry.basePath : ''))).toEqual(['/db/first/', '/db/second/'])
  })
})

describe('broken version references', () => {
  it('reads a key with broken escaping as an invalid reference instead of throwing', () => {
    const input = { path: '/in/a', url: `arn:aruna:realm:node-b:s3/db/x/%ZZ.fna@${V1}` }
    expect(nativeInput(input)).toBe(input)
    expect(badReference(input)).toBe(true)
    expect(badReference({ path: '/in/b', url: `arn:aruna:realm:node-b:s3/db/x/ok.fna@${V1}` })).toBe(false)
    expect(badReference({ path: '/in/c', url: 's3://lab/c' })).toBe(false)
  })
})
