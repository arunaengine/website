// Example data for the node mock. All values are made up.
import type { Origin } from '@/lib/fileOrigin'
import { grantTargets, isMulti, type DistributedBucket, type DistributedMember, type DistributedRange } from '@/lib/distribution'
import { grantGap, REALM_ID, type StorageQuestion, type Coverage, type DataStrategy, type MemberState, type PresetId, type RangeMode } from '@/lib/distributedMock'

export const ORDINARY_BUCKET = 'lab-raw-data'

export const BAKREP_ENDPOINT = 'https://s3.gi.denbi.de'
export const BAKREP_COUNT = 49
export const DEGRADED_RANGE = 17

export function sourceName(index: number): string {
  return `bakrep-v2-data-${String(index).padStart(3, '0')}`
}

// Three coordinators take the ranges in turn, a replica sits in the other location.
const BAKREP_NODES = ['node-1', 'node-2', 'node-3']
const BAKREP_REPLICA: Record<string, string> = {
  'node-1': 'node-3',
  'node-2': 'node-3',
  'node-3': 'node-1',
}

export function sourceObjects(index: number): number {
  return 1_020_408 + ((index * 7919) % 200_000) - 100_000
}

function bakrepRanges(): DistributedRange[] {
  return Array.from({ length: BAKREP_COUNT }, (_, index) => {
    const coordinator = BAKREP_NODES[index % BAKREP_NODES.length]
    const objects = sourceObjects(index)
    return {
      id: `r-${String(index).padStart(3, '0')}`,
      lower: index === 0 ? '' : `${sourceName(index)}/`,
      upper: index === BAKREP_COUNT - 1 ? '' : `${sourceName(index + 1)}/`,
      coordinator,
      epoch: index === 5 ? 2 : 1,
      replicas: [BAKREP_REPLICA[coordinator]],
      objects,
      bytes: objects * 183_000,
      refreshed: `2026-10-23T0${3 + (index % 4)}:${String(10 + ((index * 7) % 50)).padStart(2, '0')}:00Z`,
      degradedSince: index === DEGRADED_RANGE ? '2026-10-23T08:12:00Z' : undefined,
    }
  })
}

function bakrepMembers(): DistributedMember[] {
  return [
    { nodeId: 'node-1', state: 'ready', strategy: 'copy', coverage: 'assigned', lag: '2 s' },
    { nodeId: 'node-2', state: 'ready', strategy: 'copy', coverage: 'assigned', lag: '5 s' },
    {
      nodeId: 'node-3',
      state: 'ready',
      strategy: 'copy',
      coverage: 'assigned',
      lag: 'unknown',
      unreachableSince: '2026-10-23T08:12:00Z',
    },
    { nodeId: 'node-5', state: 'catching up', strategy: 'cache on use', coverage: 'all', lag: '62 % of records' },
  ]
}

const SPIRE_RANGE: DistributedRange = {
  id: 'r-000',
  lower: '',
  upper: '',
  coordinator: 'node-1',
  epoch: 3,
  replicas: ['node-2', 'node-3'],
  objects: 184_322,
  bytes: 6_400_000_000_000,
  refreshed: '2026-10-23T06:00:00Z',
}

export const MOCK_BUCKETS: readonly DistributedBucket[] = [
  {
    name: 'bakrep',
    preset: 'sharding-replicas',
    members: bakrepMembers(),
    ranges: bakrepRanges(),
    refresh: 'Every 24 hours',
    mode: 'serve and fill',
    searchIndex: true,
    created: '2026-10-21T09:30:00Z',
  },
  {
    name: 'spire-db',
    preset: 'mirror',
    members: [
      { nodeId: 'node-1', state: 'ready', strategy: 'copy', coverage: 'all', lag: '0 s' },
      { nodeId: 'node-2', state: 'ready', strategy: 'copy', coverage: 'all', lag: '1 s' },
      { nodeId: 'node-3', state: 'leaving', strategy: 'copy', coverage: 'all', lag: 'stopped' },
    ],
    ranges: [SPIRE_RANGE],
    refresh: 'Off',
    mode: 'passthrough',
    searchIndex: true,
    created: '2026-09-02T12:00:00Z',
  },
  {
    name: 'reads-edge',
    preset: 'stream-edge',
    members: [
      { nodeId: 'node-1', state: 'ready', strategy: 'copy', coverage: 'all', lag: '0 s' },
      { nodeId: 'node-5', state: 'ready', strategy: 'stream', coverage: 'all', lag: '3 s' },
    ],
    ranges: [{ ...SPIRE_RANGE, replicas: [], objects: 5_210, bytes: 820_000_000_000, epoch: 1 }],
    refresh: 'Off',
    mode: 'passthrough',
    searchIndex: false,
    created: '2026-10-10T15:20:00Z',
  },
  {
    name: ORDINARY_BUCKET,
    preset: 'two-node',
    members: [{ nodeId: 'node-1', state: 'ready', strategy: 'copy', coverage: 'all', lag: '0 s' }],
    ranges: [{ ...SPIRE_RANGE, replicas: [], objects: 1_840, bytes: 96_000_000_000, epoch: 1 }],
    refresh: 'Off',
    mode: 'passthrough',
    searchIndex: true,
    created: '2026-08-14T08:45:00Z',
  },
  {
    name: 'refseq',
    preset: 'mirror',
    members: [
      { nodeId: 'node-1', state: 'ready', strategy: 'copy', coverage: 'all', lag: '1 s' },
      { nodeId: 'node-3', state: 'ready', strategy: 'copy', coverage: 'all', lag: '4 s' },
    ],
    ranges: [{ ...SPIRE_RANGE, replicas: ['node-3'], objects: 318_904, bytes: 2_900_000_000_000, epoch: 1 }],
    refresh: 'Every 7 days',
    mode: 'passthrough',
    searchIndex: true,
    created: '2026-09-15T10:00:00Z',
  },
  {
    name: 'bakta-db',
    preset: 'two-node',
    members: [{ nodeId: 'node-2', state: 'ready', strategy: 'copy', coverage: 'all', lag: '0 s' }],
    ranges: [{ ...SPIRE_RANGE, coordinator: 'node-2', replicas: [], objects: 14, bytes: 66_000_000_000, epoch: 1 }],
    refresh: 'Off',
    mode: 'passthrough',
    searchIndex: false,
    created: '2026-10-05T13:30:00Z',
  },
]

export function exampleBuckets(filter = ''): DistributedBucket[] {
  const term = filter.trim().toLowerCase()
  return MOCK_BUCKETS.filter((bucket) => bucket.name.includes(term))
}

export function mockBucket(name: string): DistributedBucket | undefined {
  return MOCK_BUCKETS.find((bucket) => bucket.name === name)
}

export interface PreviewDataset {
  title: string
  group: string
  refers: string
}

export interface DeletePreview {
  datasets: PreviewDataset[]
  reasons: string[]
}

// No reasons means the preview is complete.
export const DELETE_PREVIEWS: Record<string, DeletePreview> = {
  bakrep: {
    datasets: [
      { title: 'bakrep collection', group: 'Genome Lab', refers: 'The whole bucket' },
      { title: 'E. coli genomes, 2025 release', group: 'Genome Lab', refers: 'Folder bakrep-v2-data-007/' },
      { title: 'Soil MAGs benchmark', group: 'Soil Ecology', refers: '1,284 single files' },
    ],
    reasons: [
      '2 documents on node-2 are still being indexed. Their references are not listed yet.',
      '3 references could not be matched to this bucket yet. They are retried in the background.',
      'References that name a file only by its content hash are not covered.',
    ],
  },
  'spire-db': {
    datasets: [{ title: 'SPIRE release 2026-10', group: 'Genome Lab', refers: 'Folder release-2026-10/' }],
    reasons: [],
  },
  'reads-edge': { datasets: [], reasons: [] },
  [ORDINARY_BUCKET]: {
    datasets: [{ title: 'Reef survey 2026', group: 'Genome Lab', refers: 'Folder raw/2026/' }],
    reasons: [],
  },
}

export interface MockGrant {
  holder: string
  kind: 'Group' | 'User'
  role: 'Read' | 'Write'
  nodes: string[]
}

export const MOCK_GRANTS: Record<string, MockGrant[]> = {
  bakrep: [
    { holder: 'Genome Lab', kind: 'Group', role: 'Write', nodes: ['node-1', 'node-2'] },
    { holder: 'Soil Ecology', kind: 'Group', role: 'Read', nodes: ['*'] },
    { holder: 'Mira Okafor', kind: 'User', role: 'Read', nodes: ['node-3'] },
  ],
  'spire-db': [{ holder: 'Genome Lab', kind: 'Group', role: 'Read', nodes: ['*'] }],
  'reads-edge': [{ holder: 'Sequencing Core', kind: 'Group', role: 'Write', nodes: ['node-1'] }],
  [ORDINARY_BUCKET]: [{ holder: 'Genome Lab', kind: 'Group', role: 'Write', nodes: ['node-1'] }],
}

export interface SourceDigest {
  algorithm: string
  digest: string
  scope: 'full object' | 'composite' | 'not established'
  origin: string
}

export interface ExternalInfo {
  source: string
  etag?: string
  digests: SourceDigest[]
  refreshed: string
  /** The content cannot be checked, so it may change at the source. */
  mayChange?: boolean
}

export interface Holder {
  nodeId: string
  role: string
  bytes: string
}

export interface MockObject {
  id: string
  bucket: string
  key: string
  versionId: string
  size: number
  modified: string
  servedBy: string
  how: string
  holders: Holder[]
  contentHash?: string
  external?: ExternalInfo
  datasets: string[]
}

const GENOME = 'bakrep-v2-data-007/GCF_000005845.2/'

export const MOCK_OBJECTS: readonly MockObject[] = [
  {
    id: 'genome',
    bucket: 'bakrep',
    key: `${GENOME}genome.fna.gz`,
    versionId: '01K8Y3M5R7T9W2B4D6F8H0JKNP',
    size: 1_320_448,
    modified: '2026-10-23T05:40:00Z',
    servedBy: 'node-2',
    how: 'node-2 has no copy yet. It read the file from the source and checked the recorded ETag first.',
    holders: [
      { nodeId: 'node-1', role: 'Coordinator', bytes: 'Record only' },
      { nodeId: 'node-3', role: 'Replica', bytes: 'Record only' },
      { nodeId: 'node-5', role: 'Cache on use', bytes: 'Not fetched yet' },
    ],
    external: {
      source: `${BAKREP_ENDPOINT}/bakrep-v2-data-007/GCF_000005845.2/genome.fna.gz`,
      etag: '"9b2cf535f27731c974343645a3985328"',
      digests: [
        { algorithm: 'sha256', digest: '5e0f1f4a8d3c6b27a91e4c05d7f2b8a36c19e0d4f7a25b83c6d1e9f04a7b2c58', scope: 'full object', origin: 'Checksum manifest of the source' },
        { algorithm: 'md5', digest: '9b2cf535f27731c974343645a3985328', scope: 'not established', origin: 'Listing ETag, evidence only' },
      ],
      refreshed: '2026-10-23T05:40:00Z',
    },
    datasets: ['E. coli genomes, 2025 release', 'bakrep collection'],
  },
  {
    id: 'annotation',
    bucket: 'bakrep',
    key: `${GENOME}annotation.gff3.gz`,
    versionId: '01K8Y3M5R7T9W2B4D6F8H0JKNQ',
    size: 412_903,
    modified: '2026-10-23T05:40:00Z',
    servedBy: 'node-2',
    how: 'node-2 read the whole file from the source, checked it, and then sent it.',
    holders: [
      { nodeId: 'node-1', role: 'Coordinator', bytes: 'Record only' },
      { nodeId: 'node-3', role: 'Replica', bytes: 'Record only' },
    ],
    external: {
      source: `${BAKREP_ENDPOINT}/bakrep-v2-data-007/GCF_000005845.2/annotation.gff3.gz`,
      digests: [],
      refreshed: '2026-10-23T05:40:00Z',
      mayChange: true,
    },
    datasets: ['bakrep collection'],
  },
  {
    id: 'release',
    bucket: 'spire-db',
    key: 'release-2026-10/spire_mags.tsv.zst',
    versionId: '01K8W9C2D4F6H8KMQ0S2V4X6ZA',
    size: 48_318_382_080,
    modified: '2026-10-02T11:05:00Z',
    servedBy: 'node-2',
    how: 'node-2 holds a full copy and served the file itself.',
    holders: [
      { nodeId: 'node-1', role: 'Coordinator', bytes: 'Full copy' },
      { nodeId: 'node-2', role: 'Replica', bytes: 'Full copy' },
      { nodeId: 'node-3', role: 'Replica, leaving', bytes: 'Full copy' },
    ],
    contentHash: '3f7a9c1e5b2d8046fa1c7e93b5d0a2486c91e7f3a5b0d24c68e1f9a37b5c0d82',
    datasets: ['SPIRE release 2026-10'],
  },
  {
    id: 'genome31',
    bucket: 'bakrep',
    key: 'bakrep-v2-data-031/GCF_003697165.2/genome.fna.gz',
    versionId: '01K8Y3M5R7T9W2B4D6F8H0JKNR',
    size: 1_287_330,
    modified: '2026-10-23T05:52:00Z',
    servedBy: 'node-2',
    how: 'node-2 has no copy yet. It read the file from the source and checked the recorded ETag first.',
    holders: [
      { nodeId: 'node-2', role: 'Coordinator', bytes: 'Record only' },
      { nodeId: 'node-3', role: 'Replica', bytes: 'Record only' },
    ],
    external: {
      source: `${BAKREP_ENDPOINT}/bakrep-v2-data-031/GCF_003697165.2/genome.fna.gz`,
      etag: '"4d7e0a19b3c85f62e1a70d94c8b3f517"',
      digests: [
        { algorithm: 'md5', digest: '4d7e0a19b3c85f62e1a70d94c8b3f517', scope: 'not established', origin: 'Listing ETag, evidence only' },
      ],
      refreshed: '2026-10-23T05:52:00Z',
    },
    datasets: ['bakrep collection'],
  },
  {
    id: 'genome44',
    bucket: 'bakrep',
    key: 'bakrep-v2-data-044/GCF_000008865.2/genome.fna.gz',
    versionId: '01K8Y3M5R7T9W2B4D6F8H0JKNS',
    size: 1_301_776,
    modified: '2026-10-23T06:03:00Z',
    servedBy: 'node-2',
    how: 'node-2 has no copy yet. It read the file from the source and checked the recorded ETag first.',
    holders: [
      { nodeId: 'node-1', role: 'Coordinator', bytes: 'Record only' },
      { nodeId: 'node-3', role: 'Replica', bytes: 'Record only' },
    ],
    external: {
      source: `${BAKREP_ENDPOINT}/bakrep-v2-data-044/GCF_000008865.2/genome.fna.gz`,
      etag: '"c21b7f40a5d9e386b0f14c72ad85e903"',
      digests: [
        { algorithm: 'md5', digest: 'c21b7f40a5d9e386b0f14c72ad85e903', scope: 'not established', origin: 'Listing ETag, evidence only' },
      ],
      refreshed: '2026-10-23T06:03:00Z',
    },
    datasets: ['bakrep collection'],
  },
  {
    id: 'escherichia',
    bucket: 'spire-db',
    key: 'release-2026-10/escherichia_coli_mags.tsv.zst',
    versionId: '01K8W9C2D4F6H8KMQ0S2V4X6ZB',
    size: 2_113_536_000,
    modified: '2026-10-02T11:07:00Z',
    servedBy: 'node-2',
    how: 'node-2 holds a full copy and served the file itself.',
    holders: [
      { nodeId: 'node-1', role: 'Coordinator', bytes: 'Full copy' },
      { nodeId: 'node-2', role: 'Replica', bytes: 'Full copy' },
      { nodeId: 'node-3', role: 'Replica, leaving', bytes: 'Full copy' },
    ],
    contentHash: '8c04e7b21f6a93d5e0b7c418a2f6d93b07e5c1a8d4f20b6e93a7c5d18f0e2b46',
    datasets: ['SPIRE release 2026-10'],
  },
  {
    id: 'reef-reads',
    bucket: ORDINARY_BUCKET,
    key: 'raw/2026/reef-07/reads_R1.fastq.gz',
    versionId: '01K8V2A4C6E8GJMPRTVXZ13579',
    size: 3_822_104_576,
    modified: '2026-08-20T10:12:00Z',
    servedBy: 'node-1',
    how: 'node-1 holds the file and served it itself.',
    holders: [{ nodeId: 'node-1', role: 'Only copy', bytes: 'Full copy' }],
    contentHash: '1d9e5a07c3b84f26a0e7d19c5b3f8a64e2c07d91b5a3f84e60c2d7a19b8e5f30',
    datasets: ['Reef survey 2026'],
  },
  {
    id: 'reef-notes',
    bucket: ORDINARY_BUCKET,
    key: 'raw/2026/reef-07/notes.txt',
    versionId: '01K8V2A4C6E8GJMPRTVXZ24680',
    size: 2_048,
    modified: '2026-08-20T10:14:00Z',
    servedBy: 'node-1',
    how: 'node-1 holds the file and served it itself.',
    holders: [{ nodeId: 'node-1', role: 'Only copy', bytes: 'Full copy' }],
    contentHash: '6b30f2e8a1c95d47e0b36f8a2d19c5e7403a8b1f6d2e95c07a34b8e1d60f2a95',
    datasets: ['Reef survey 2026'],
  },
]

export interface ImportState {
  percent: number
  state: 'done' | 'running' | 'queued'
}

// A snapshot of a running registration: the first ranges are done, the next ones run.
export function importProgress(index: number): ImportState {
  if (index < 20) return { percent: 100, state: 'done' }
  if (index < 28) return { percent: 20 + ((index * 13) % 70), state: 'running' }
  return { percent: 0, state: 'queued' }
}

export function sourceCoordinator(index: number): string {
  return BAKREP_NODES[index % BAKREP_NODES.length]
}

export interface ExampleEntry {
  key: string
  name: string
  size: number
  modified: string
}

export interface ExampleListing {
  folders: { prefix: string; name: string }[]
  files: ExampleEntry[]
}

const FIRST_SAMPLE: Record<number, string> = { 7: 'GCF_000005845.2', 31: 'GCF_003697165.2', 44: 'GCF_000008865.2' }
const SOURCE_FILES = ['genome.fna.gz', 'annotation.gff3.gz']
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LISTED_AT = '2026-10-23T05:40:00Z'

function hashOf(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0
  return hash
}

function digits(text: string, length: number, alphabet: string): string {
  let hash = hashOf(text) || 1
  let out = ''
  for (let index = 0; index < length; index += 1) {
    hash ^= hash << 13
    hash ^= hash >>> 17
    hash ^= hash << 5
    hash >>>= 0
    out += alphabet[hash % alphabet.length]
  }
  return out
}

function sampleIds(index: number): string[] {
  const other = (step: number) => `GCF_${String(1000 + index * 37 + step * 11).padStart(9, '0')}.1`
  return [FIRST_SAMPLE[index] ?? other(0), other(1), other(2)]
}

function sourceIndex(folder: string): number {
  return BAKREP_NAMES.indexOf(folder)
}

const BAKREP_NAMES = Array.from({ length: BAKREP_COUNT }, (_, index) => sourceName(index))

function bakrepEntry(index: number, sample: string, file: string): ExampleEntry {
  const key = `${sourceName(index)}/${sample}/${file}`
  const defined = MOCK_OBJECTS.find((object) => object.key === key)
  return { key, name: file, size: defined?.size ?? 300_000 + (hashOf(key) % 1_500_000), modified: defined?.modified ?? LISTED_AT }
}

const PLAIN_FILES: Record<string, { key: string; size: number }[]> = {
  'spire-db': [
    { key: 'release-2026-10/metadata/samples.tsv.zst', size: 412_000_000 },
    { key: 'release-2026-09/spire_mags.tsv.zst', size: 46_900_000_000 },
    { key: 'docs/README.md', size: 6_400 },
  ],
  'reads-edge': [
    { key: 'runs/2026-10-01/sample-01.fastq.gz', size: 5_100_000_000 },
    { key: 'runs/2026-10-01/sample-02.fastq.gz', size: 4_700_000_000 },
    { key: 'runs/2026-10-08/sample-03.fastq.gz', size: 5_400_000_000 },
    { key: 'qc/summary.tsv', size: 18_300 },
  ],
  refseq: [
    { key: 'bacteria/GCF_000005845.2_genomic.fna.gz', size: 1_320_000 },
    { key: 'bacteria/GCF_000006765.1_genomic.fna.gz', size: 2_010_000 },
    { key: 'viruses/viral.1.1.genomic.fna.gz', size: 98_000_000 },
    { key: 'README.txt', size: 5_100 },
  ],
  'bakta-db': [
    { key: 'db/bakta.db', size: 52_000_000_000 },
    { key: 'db/version.json', size: 210 },
    { key: 'db-light/bakta.db', size: 1_900_000_000 },
  ],
  [ORDINARY_BUCKET]: [
    { key: 'raw/2026/reef-07/reads_R2.fastq.gz', size: 3_790_000_000 },
    { key: 'raw/2026/reef-08/reads_R1.fastq.gz', size: 3_410_000_000 },
    { key: 'analysis/coverage.tsv', size: 92_000 },
  ],
}

function plainEntries(bucket: string): ExampleEntry[] {
  const defined = MOCK_OBJECTS.filter((object) => object.bucket === bucket).map((object) => ({
    key: object.key,
    name: object.key.split('/').pop() ?? object.key,
    size: object.size,
    modified: object.modified,
  }))
  const plain = (PLAIN_FILES[bucket] ?? []).map((file) => ({
    ...file,
    name: file.key.split('/').pop() ?? file.key,
    modified: '2026-10-02T11:05:00Z',
  }))
  return [...defined, ...plain]
}

// The folders and files directly under a prefix, as an S3 listing would return them.
export function exampleListing(bucket: string, prefix: string, nameStart = ''): ExampleListing {
  const start = nameStart.toLowerCase()
  const keep = (name: string) => name.toLowerCase().startsWith(start)
  if (bucket === 'bakrep') {
    const parts = prefix.split('/').filter(Boolean)
    if (!parts.length) {
      return { folders: BAKREP_NAMES.filter(keep).map((name) => ({ prefix: `${name}/`, name })), files: [] }
    }
    const index = sourceIndex(parts[0])
    if (index < 0 || parts.length > 2) return { folders: [], files: [] }
    if (parts.length === 1) {
      return { folders: sampleIds(index).filter(keep).map((name) => ({ prefix: `${prefix}${name}/`, name })), files: [] }
    }
    if (!sampleIds(index).includes(parts[1])) return { folders: [], files: [] }
    return { folders: [], files: SOURCE_FILES.filter(keep).map((file) => bakrepEntry(index, parts[1], file)) }
  }
  const folders = new Map<string, { prefix: string; name: string }>()
  const files: ExampleEntry[] = []
  for (const entry of plainEntries(bucket)) {
    if (!entry.key.startsWith(prefix)) continue
    const rest = entry.key.slice(prefix.length)
    if (!keep(rest)) continue
    const slash = rest.indexOf('/')
    if (slash < 0) files.push({ ...entry, name: rest })
    else folders.set(rest.slice(0, slash), { prefix: `${prefix}${rest.slice(0, slash)}/`, name: rest.slice(0, slash) })
  }
  return { folders: [...folders.values()], files }
}

function bakrepObject(key: string): MockObject | undefined {
  const [folder, sample, file, ...extra] = key.split('/')
  const index = sourceIndex(folder ?? '')
  if (index < 0 || extra.length || !sampleIds(index).includes(sample ?? '') || !SOURCE_FILES.includes(file ?? '')) return undefined
  const entry = bakrepEntry(index, sample, file)
  const coordinator = BAKREP_NODES[index % BAKREP_NODES.length]
  const genome = file === 'genome.fna.gz'
  const etag = digits(`${key}:etag`, 32, '0123456789abcdef')
  return {
    id: key,
    bucket: 'bakrep',
    key,
    versionId: `01K8Y3M5R7${digits(key, 16, CROCKFORD)}`,
    size: entry.size,
    modified: LISTED_AT,
    servedBy: 'node-2',
    how: 'node-2 has no copy yet. It read the file from the source and checked it first.',
    holders: [
      { nodeId: coordinator, role: 'Coordinator', bytes: 'Record only' },
      { nodeId: BAKREP_REPLICA[coordinator], role: 'Replica', bytes: 'Record only' },
    ],
    external: {
      source: `${BAKREP_ENDPOINT}/${key}`,
      etag: genome ? `"${etag}"` : undefined,
      digests: genome ? [{ algorithm: 'md5', digest: etag, scope: 'not established', origin: 'Listing ETag, evidence only' }] : [],
      refreshed: LISTED_AT,
      mayChange: !genome,
    },
    datasets: ['bakrep collection'],
  }
}

const HELD: Record<DataStrategy, string> = {
  copy: 'Full copy',
  'copy on use': 'Not fetched yet',
  'cache on use': 'Not fetched yet',
  stream: 'No bytes kept',
}

function plainObject(bucket: string, key: string): MockObject | undefined {
  const file = (PLAIN_FILES[bucket] ?? []).find((entry) => entry.key === key)
  const found = mockBucket(bucket)
  if (!file || !found) return undefined
  return {
    id: key,
    bucket,
    key,
    versionId: `01K8V2A4C6${digits(key, 16, CROCKFORD)}`,
    size: file.size,
    modified: '2026-10-02T11:05:00Z',
    servedBy: found.members[0].nodeId,
    how: `${found.members[0].nodeId} holds the file and served it itself.`,
    holders: found.members.map((member, index) => ({
      nodeId: member.nodeId,
      role: index === 0 ? 'Coordinator' : member.strategy === 'copy' ? 'Replica' : 'Edge',
      bytes: HELD[member.strategy],
    })),
    contentHash: digits(`${key}:blake3`, 64, '0123456789abcdef'),
    datasets: [],
  }
}

export function mockFile(bucket: string, key: string): MockObject | undefined {
  const defined = MOCK_OBJECTS.find((object) => object.bucket === bucket && object.key === key)
  if (defined) return defined
  return bucket === 'bakrep' ? bakrepObject(key) : plainObject(bucket, key)
}

// The marker a file row carries: where the bytes come from, and whether Aruna can check the content.
export function exampleMark(bucket: string, key: string): string | null {
  const external = mockFile(bucket, key)?.external
  if (!external) return null
  return external.mayChange ? 'Can change at the source' : 'From a source'
}

export interface SourceLine {
  label: string
  value: string
  question: StorageQuestion
}

// How files got into a bucket, incoming paths only. No line means uploads only.
export const FILE_SOURCES: Record<string, SourceLine[]> = {
  bakrep: [{ label: 'From an external source', value: 's3.gi.denbi.de, about 50 million files, not copied', question: 'elsewhere' }],
  'spire-db': [
    { label: 'Uploaded directly', value: '11 files', question: 'elsewhere' },
    { label: 'Copied by a sync', value: 'spire-staging (Genome Lab), continuous', question: 'sync' },
  ],
  'reads-edge': [
    { label: 'Registered from a storage folder', value: 'sequencer-share, 5,210 files, not copied', question: 'elsewhere' },
  ],
  [ORDINARY_BUCKET]: [
    { label: 'Uploaded directly', value: '1,828 files', question: 'elsewhere' },
    { label: 'From a database', value: 'SPIRE database, 12 files, not copied', question: 'elsewhere' },
  ],
  refseq: [
    { label: 'From an external source', value: 'ftp.ncbi.nlm.nih.gov/refseq, about 320,000 files, not copied', question: 'elsewhere' },
  ],
}

export function sourceLines(bucket: string): SourceLine[] {
  return FILE_SOURCES[bucket] ?? []
}

export interface BucketCopy {
  to: string
  how: string
}

// Other buckets that get a copy of this one by a sync.
export const BUCKET_COPIES: Record<string, BucketCopy[]> = {
  'spire-db': [{ to: 'spire-public', how: 'Group Open Data, sync as references' }],
  [ORDINARY_BUCKET]: [{ to: 'lab-archive', how: 'On node-2, sync continuously' }],
}

export function bucketCopies(bucket: string): BucketCopy[] {
  return BUCKET_COPIES[bucket] ?? []
}

export interface FileHit {
  key: string
  title: string
  subtitle: string
  bucket: string
}

// File name matches of the example buckets: every word of the query must occur in the key.
export function searchFiles(query: string): FileHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length >= 2)
  if (!words.length) return []
  return MOCK_OBJECTS.filter((file) => words.every((word) => file.key.toLowerCase().includes(word))).map((file) => {
    const nodes = mockBucket(file.bucket)?.members.length ?? 0
    return {
      key: file.versionId,
      title: file.key,
      subtitle: `${nodes > 1 ? `Stored on ${nodes} nodes` : 'Stored on this node'} · Bucket: ${file.bucket}`,
      bucket: file.bucket,
    }
  })
}

export interface GrantWarning {
  bucket: string
  missing: string[]
}

// Role paths like data/node-1/bakrep/** that name some nodes of an example bucket, not all.
export function grantWarnings(suffixes: readonly string[]): GrantWarning[] {
  return [...grantTargets(suffixes)].flatMap(([bucket, nodes]) => {
    const found = mockBucket(bucket)
    const missing = found && isMulti(found) ? grantGap(nodes, found.members.map((member) => member.nodeId)) : []
    return missing.length ? [{ bucket, missing }] : []
  })
}

export type DatabaseReaders = 'Everyone in the realm' | 'Public'

// A dataset can link a bucket or a folder in a bucket as one folder-like part, always with the
// current files. Linking a database is ordinary dataset-to-dataset metadata: it does not make the
// files of the database part of the dataset.
export interface LinkedPart {
  kind: 'bucket' | 'folder' | 'database'
  bucket: string
  prefix?: string
}

export interface ExampleDataset {
  id: string
  name: string
  description: string
  license: string
  creator: string
  source: string
  group: string
  parts: LinkedPart[]
}

export const OWNING_GROUP: Record<string, string> = {
  bakrep: 'Genome Lab',
  'spire-db': 'Genome Lab',
  refseq: 'Genome Lab',
  'bakta-db': 'Genome Lab',
  'reads-edge': 'Sequencing Core',
  [ORDINARY_BUCKET]: 'Genome Lab',
}

function describing(
  id: string,
  name: string,
  description: string,
  license: string,
  creator: string,
  source: string,
  bucket: string,
): ExampleDataset {
  return { id, name, description, license, creator, source, group: OWNING_GROUP[bucket], parts: [{ kind: 'bucket', bucket }] }
}

export const DATASETS_START: readonly ExampleDataset[] = [
  describing('01K8Z0DB0BAKREP00000000001', 'bakrep', 'About 50 million annotated bacterial genomes.', 'CC BY 4.0', 'de.NBI cloud team', 'de.NBI cloud, s3.gi.denbi.de', 'bakrep'),
  describing('01K8Z0DB0REFSEQ00000000002', 'RefSeq', 'NCBI reference sequences of genomes, transcripts and proteins.', 'Public domain', 'NCBI', 'NCBI, ftp.ncbi.nlm.nih.gov/refseq', 'refseq'),
  describing('01K8Z0DB0SPIRE000000000003', 'SPIRE database', 'Metagenome-assembled genomes of microbial communities.', 'CC BY 4.0', 'SPIRE team, EMBL', 'SPIRE, EMBL', 'spire-db'),
  describing('01K8Z0DB0BAKTA000000000004', 'Bakta database', 'Reference data for the Bakta annotation tool.', 'CC BY 4.0', 'Oliver Schwengers', 'Zenodo, record 10522951', 'bakta-db'),
  {
    id: '01K8Z0DS0REEF0000000000005',
    name: 'Reef survey 2026',
    description: 'Reads and notes of the 2026 reef survey.',
    license: 'CC BY 4.0',
    creator: 'Mira Okafor',
    source: 'Own sequencing',
    group: 'Genome Lab',
    parts: [{ kind: 'folder', bucket: ORDINARY_BUCKET, prefix: 'raw/2026' }],
  },
  {
    id: '01K8Z0DS0ECOLI000000000006',
    name: 'E. coli genomes, 2025 release',
    description: 'The E. coli genomes of one source bucket of bakrep.',
    license: 'CC BY 4.0',
    creator: 'Hendrik Voss',
    source: 'bakrep',
    group: 'Genome Lab',
    parts: [
      { kind: 'folder', bucket: 'bakrep', prefix: 'bakrep-v2-data-007' },
      { kind: 'database', bucket: 'refseq' },
    ],
  },
  {
    id: '01K8Z0DS0RUNS0000000000007',
    name: 'Sequencing runs 2026',
    description: 'Runs of the sequencer in 2026.',
    license: 'CC BY 4.0',
    creator: 'Sequencing Core',
    source: 'Own sequencing',
    group: 'Sequencing Core',
    parts: [{ kind: 'folder', bucket: 'reads-edge', prefix: 'runs' }],
  },
]

export interface RealmRole {
  name: string
  users: string[]
}

// Realm roles of the example realm. Database curators hold WRITE on the databases path.
export const REALM_ROLES: readonly RealmRole[] = [
  { name: 'Database curators', users: ['Mira Okafor', 'Hendrik Voss'] },
  { name: 'Data stewards', users: ['Ana Lopez', 'Kofi Mensah', 'Yuki Tanaka'] },
  { name: 'Group leads', users: ['Sofia Richter'] },
]

// A database is a bucket plus a linked dataset that describes it. Any bucket can be one.
export interface DatabaseEntry {
  id: string
  bucket: string
  datasetId: string
  readers: DatabaseReaders
  /** Pending until the group admins of the owning group agree. */
  status: 'agreed' | 'pending'
}

export const DATABASES_START: readonly DatabaseEntry[] = [
  { id: 'bakrep', bucket: 'bakrep', datasetId: '01K8Z0DB0BAKREP00000000001', readers: 'Public', status: 'agreed' },
  { id: 'refseq', bucket: 'refseq', datasetId: '01K8Z0DB0REFSEQ00000000002', readers: 'Everyone in the realm', status: 'agreed' },
  { id: 'spire', bucket: 'spire-db', datasetId: '01K8Z0DB0SPIRE000000000003', readers: 'Public', status: 'agreed' },
  { id: 'bakta', bucket: 'bakta-db', datasetId: '01K8Z0DB0BAKTA000000000004', readers: 'Everyone in the realm', status: 'agreed' },
]

// The RO-Crate of a database dataset: the bucket is one folder part, files stay unnamed under it.
export function crateOf(dataset: ExampleDataset): Record<string, unknown> {
  return {
    '@id': './',
    '@type': 'Dataset',
    name: dataset.name,
    description: dataset.description,
    license: dataset.license,
    creator: dataset.creator,
    hasPart: dataset.parts.map((part) => ({ '@id': partId(part) })),
  }
}

export function partId(part: LinkedPart): string {
  if (part.kind === 'database') {
    return `https://w3id.org/aruna/${DATABASES_START.find((entry) => entry.bucket === part.bucket)?.datasetId ?? part.bucket}`
  }
  return `s3://${part.bucket}/${part.prefix ? `${part.prefix}/` : ''}`
}

export function partLabel(part: LinkedPart): string {
  const name = part.prefix ? `${part.bucket}/${part.prefix}` : part.bucket
  const what = part.kind === 'folder' ? 'linked folder' : part.kind === 'database' ? 'linked database' : 'linked bucket'
  return `${name}, ${what}`
}

const idOf = (version: string) => `/${REALM_ID}/${version}`

const ORIGINS: Record<string, Origin> = {
  'spire-db:release-2026-10/escherichia_coli_mags.tsv.zst': {
    kind: 'sync',
    sync: 'spire-staging to spire-db',
    from: idOf('01K8W1B3D5F7H9KMQ1S3V5X7Z2'),
  },
  'lab-raw-data:raw/2026/reef-07/reads_R1.fastq.gz': {
    kind: 'upload',
    user: 'Mira Okafor',
    node: 'node-1',
    time: '2026-08-20T10:12:00Z',
    device: 'sequencer-laptop-3',
  },
  'lab-raw-data:raw/2026/reef-08/reads_R1.fastq.gz': { kind: 'copy', from: idOf('01K8T6A2C4E6G8JKMPRSTVXZ13') },
  'lab-raw-data:analysis/coverage.tsv': { kind: 'job', run: '01K8V5N7Q9S1U3W5Y7Z9B2D4F6' },
}

// Where a file version came from, set when it was created and never changed.
export function originOf(object: MockObject): Origin {
  const known = ORIGINS[`${object.bucket}:${object.key}`]
  if (known) return known
  const database = DATASETS_START.find((dataset) => dataset.id === DATABASES_START.find((entry) => entry.bucket === object.bucket)?.datasetId)?.name
  if (object.external) {
    const url = new URL(object.external.source)
    const digest = object.external.digests[0]
    return {
      kind: 'source',
      source: url.origin,
      path: url.pathname.slice(1),
      etag: object.external.etag,
      digest: digest ? `${digest.algorithm}:${digest.digest}` : undefined,
      database,
    }
  }
  if (object.bucket === 'refseq') {
    return { kind: 'source', source: 'https://ftp.ncbi.nlm.nih.gov', path: `refseq/${object.key}`, database }
  }
  if (object.bucket === 'bakta-db') {
    return { kind: 'source', source: 'https://zenodo.org', path: `records/10522951/files/${object.key.split('/').pop()}`, database }
  }
  if (object.bucket === 'reads-edge') return { kind: 'storage', folder: 'sequencer-share', key: object.key }
  return { kind: 'upload', user: 'Mira Okafor', node: object.holders[0]?.nodeId ?? 'node-1', time: object.modified }
}

export interface BasedOn {
  label: string
  value: string
  /** isBasedOn for derived data, isPartOf for a linked dataset, run for a job result. */
  property: 'isBasedOn' | 'isPartOf' | 'run'
}

// What the dataset editor adds as isBasedOn when this file joins a dataset.
export function basedOn(origin: Origin): BasedOn[] {
  const w3id = (id: string) => `https://w3id.org/aruna/data${id}`
  if (origin.kind === 'source') return [{ label: 'Source', value: `${origin.source}/${origin.path}`, property: 'isBasedOn' }]
  if (origin.kind === 'copy' || origin.kind === 'sync') {
    return [{ label: 'Original version', value: w3id(origin.from), property: 'isBasedOn' }]
  }
  if (origin.kind === 'job') return [{ label: 'Run', value: origin.run, property: 'run' }]
  // Uploads have no origin to add, and storage paths stay private.
  return []
}
