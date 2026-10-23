import { afterEach, describe, expect, it } from 'vitest'
import { docsTopicBySlug } from '@/docs/v1'
import { applyPortalConfig } from '@/lib/config'
import { defaultSettings, mockEnabled, firstResults, grantGap, isPending, nodeGlob, planRanges, plannedStart, presetMembers, rangeTotal, retryResult, STORAGE_QUESTIONS } from './distributedMock'
import { BAKREP_COUNT, exampleListing, exampleMark, grantWarnings, mockFile, sourceLines, bucketCopies, basedOn, originOf, DATABASES_START, mockBucket, searchFiles, sourceObjects } from './distributedMockData'

describe('distributed mock helpers', () => {
  it('reports the members a node-specific grant does not reach', () => {
    const members = ['node-1', 'node-2', 'node-3']
    expect(grantGap(['node-1', 'node-2'], members)).toEqual(['node-3'])
    expect(grantGap(['*'], members)).toEqual([])
  })

  it('builds the recommended glob from the bucket name', () => {
    expect(nodeGlob('bakrep')).toMatch(/^\/[^/]+\/g\/[^/]+\/data\/\*\/bakrep\/\*\*$/)
  })

  it('puts a replica in another location than its coordinator', () => {
    const ranges = planRanges(4, ['node-1', 'node-2', 'node-3', 'node-5'], true)
    expect(ranges.map((range) => range.coordinator)).toEqual(['node-1', 'node-2', 'node-3', 'node-5'])
    expect(ranges[0].replica).toBe('node-3')
    expect(ranges[2].replica).toBe('node-1')
  })

  it('gives the edge presets a single copy origin and an edge member', () => {
    const [origin, edge] = presetMembers('stream-edge')
    expect(origin.strategy).toBe('copy')
    expect(edge.strategy).toBe('stream')
  })

  it('has one bakrep range per source bucket and about 50 million files', () => {
    const bakrep = mockBucket('bakrep')
    expect(bakrep?.ranges).toHaveLength(BAKREP_COUNT)
    const total = Array.from({ length: BAKREP_COUNT }, (_, index) => sourceObjects(index)).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(49_000_000)
    expect(total).toBeLessThan(51_000_000)
    expect(bakrep?.ranges.filter((range) => range.degradedSince)).toHaveLength(1)
  })

  it('counts ranges from the chosen hint and keeps them within the limit', () => {
    const settings = defaultSettings('sharding')
    expect(rangeTotal(settings)).toBe(8)
    expect(rangeTotal({ ...settings, count: 99_999 })).toBe(4096)
    const keys = { ...settings, hint: 'keys' as const, keys: 'genomes/m\n\ngenomes/t\n' }
    expect(rangeTotal(keys)).toBe(3)
    expect(plannedStart(keys, 2)).toBe('genomes/t')
    expect(rangeTotal({ ...settings, hint: 'import' })).toBe(49)
  })

  it('keeps the bucket pending until the failed member is created', () => {
    const first = firstResults(presetMembers('mirror'))
    expect(first.map((result) => result.created)).toEqual([true, true, false])
    expect(isPending(first)).toBe(true)
    const again = retryResult(first[2])
    expect(again.created).toBe(false)
    expect(retryResult(again).created).toBe(true)
  })

  it('stays off until the deployment turns the feature on', () => {
    expect(mockEnabled()).toBe(false)
    applyPortalConfig({ features: { distributedMock: true } })
    expect(mockEnabled()).toBe(true)
    applyPortalConfig({})
  })

  it('warns for a role that names some nodes of an example bucket', () => {
    expect(grantWarnings(['data/node-1/bakrep/**', 'data/node-2/bakrep/**'])).toEqual([
      { bucket: 'bakrep', missing: ['node-3', 'node-5'] },
    ])
    expect(grantWarnings(['data/*/bakrep/**', 'data/node-1/lab-raw-data/**', 'meta/**'])).toEqual([])
  })

  it('lists folders and files of an example bucket like S3 does', () => {
    const root = exampleListing('bakrep', '')
    expect(root.folders).toHaveLength(BAKREP_COUNT)
    expect(root.folders[0]).toEqual({ prefix: 'bakrep-v2-data-000/', name: 'bakrep-v2-data-000' })
    const samples = exampleListing('bakrep', 'bakrep-v2-data-007/').folders
    expect(samples[0].name).toBe('GCF_000005845.2')
    const files = exampleListing('bakrep', samples[0].prefix).files
    expect(files.map((file) => file.name)).toEqual(['genome.fna.gz', 'annotation.gff3.gz'])
    expect(exampleListing('spire-db', 'release-2026-10/').folders.map((folder) => folder.name)).toEqual(['metadata'])
    expect(exampleListing('spire-db', '', 'doc').folders.map((folder) => folder.name)).toEqual(['docs'])
  })

  it('marks files from a source and gives every listed file its details', () => {
    const sample = exampleListing('bakrep', 'bakrep-v2-data-012/').folders[0]
    const [genome, annotation] = exampleListing('bakrep', sample.prefix).files
    expect(exampleMark('bakrep', genome.key)).toBe('From a source')
    expect(exampleMark('bakrep', annotation.key)).toBe('Can change at the source')
    expect(mockFile('bakrep', genome.key)?.size).toBe(genome.size)
    expect(exampleMark('lab-raw-data', 'raw/2026/reef-07/notes.txt')).toBeNull()
    expect(mockFile('bakrep', genome.key)?.external?.digests[0].scope).toBe('not established')
  })

  it('lists incoming file sources and outgoing copies apart', () => {
    expect(sourceLines('lab-raw-data')).toHaveLength(2)
    expect(sourceLines('bakrep')[0].text).toContain('without copying')
    expect(bucketCopies('spire-db')[0]).toContain('spire-public')
    expect(bucketCopies('bakrep')).toEqual([])
    expect(sourceLines('nothing-here')).toEqual([])
  })

  it('keeps a mix of origins and turns them into isBasedOn entries', () => {
    const origin = (bucket: string, key: string) => originOf(mockFile(bucket, key)!)
    const registered = origin('bakrep', 'bakrep-v2-data-007/GCF_000005845.2/genome.fna.gz')
    expect(registered).toMatchObject({ kind: 'source', source: 'https://s3.gi.denbi.de', database: 'bakrep' })
    expect(basedOn(registered)[0].value).toBe('https://s3.gi.denbi.de/bakrep-v2-data-007/GCF_000005845.2/genome.fna.gz')
    expect(origin('lab-raw-data', 'raw/2026/reef-07/reads_R1.fastq.gz')).toMatchObject({ kind: 'upload', device: 'sequencer-laptop-3' })
    expect(basedOn(origin('lab-raw-data', 'raw/2026/reef-07/reads_R1.fastq.gz'))).toEqual([])
    expect(origin('spire-db', 'release-2026-10/escherichia_coli_mags.tsv.zst').kind).toBe('sync')
    expect(basedOn(origin('spire-db', 'release-2026-10/escherichia_coli_mags.tsv.zst'))[0].value).toMatch(/^https:\/\/w3id\.org\/aruna\/data\//)
    expect(origin('lab-raw-data', 'analysis/coverage.tsv').kind).toBe('job')
    expect(basedOn(origin('lab-raw-data', 'analysis/coverage.tsv'))).toEqual([
      { label: 'Run', value: '01K8V5N7Q9S1U3W5Y7Z9B2D4F6', property: 'run' },
    ])
    expect(origin('reads-edge', 'qc/summary.tsv').kind).toBe('storage')
    expect(basedOn(origin('reads-edge', 'qc/summary.tsv'))).toEqual([])
    expect(DATABASES_START.map((entry) => entry.bucket).every((name) => mockBucket(name))).toBe(true)
  })

  it('keeps being a database bucket apart from where a bucket is stored', () => {
    const marked = (name: string) => DATABASES_START.some((entry) => entry.bucket === name)
    expect([marked('bakta-db'), mockBucket('bakta-db')?.members.length]).toEqual([true, 1])
    expect([marked('refseq'), mockBucket('refseq')?.members.length]).toEqual([true, 2])
    expect([marked('reads-edge'), mockBucket('reads-edge')?.members.length]).toEqual([false, 2])
    expect(marked('lab-raw-data')).toBe(false)
    expect(marked('bakrep') && marked('spire-db')).toBe(true)
  })

  it('finds example files when every word of the query is in the key', () => {
    expect(searchFiles('genome gcf_000005845').map((hit) => hit.title)).toEqual([
      'bakrep-v2-data-007/GCF_000005845.2/genome.fna.gz',
    ])
    expect(searchFiles('genome').length).toBeGreaterThan(2)
    expect(searchFiles('a')).toEqual([])
  })

  it('answers every storage question in the guide', () => {
    const titles = docsTopicBySlug('storage-features')?.sections.map((section) => section.title) ?? []
    for (const title of Object.values(STORAGE_QUESTIONS)) expect(titles).toContain(title)
  })
})
