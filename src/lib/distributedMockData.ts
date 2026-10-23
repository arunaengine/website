// Example data for the node mock. All values are made up.
import { grantGap, type Coverage, type DataStrategy, type MemberState, type PresetId, type RangeMode } from '@/lib/distributedMock'

export interface MockMember {
  nodeId: string
  state: MemberState
  strategy: DataStrategy
  coverage: Coverage
  lag: string
  unreachableSince?: string
}

export interface MockRange {
  id: string
  lower: string
  upper: string
  coordinator: string
  epoch: number
  replicas: string[]
  objects: number
  bytes: number
  refreshed: string
  degradedSince?: string
}

export interface MockBucket {
  name: string
  preset: PresetId
  members: MockMember[]
  ranges: MockRange[]
  refresh: string
  mode: RangeMode
  searchIndex: boolean
  created: string
}

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

function bakrepRanges(): MockRange[] {
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

function bakrepMembers(): MockMember[] {
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

const SPIRE_RANGE: MockRange = {
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

export const MOCK_BUCKETS: readonly MockBucket[] = [
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
]

// An ordinary bucket lives on one node. Only a bucket on more nodes has the Nodes tab.
export function isMulti(bucket: MockBucket): boolean {
  return bucket.members.length > 1
}

export function exampleBuckets(filter = ''): MockBucket[] {
  const term = filter.trim().toLowerCase()
  return MOCK_BUCKETS.filter((bucket) => bucket.name.includes(term))
}

export function mockBucket(name: string): MockBucket | undefined {
  return MOCK_BUCKETS.find((bucket) => bucket.name === name)
}

export function degradedRanges(bucket: MockBucket): MockRange[] {
  return bucket.ranges.filter((range) => range.degradedSince)
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
  notPinned?: string
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
        { algorithm: 'md5', digest: '9b2cf535f27731c974343645a3985328', scope: 'full object', origin: 'Listing ETag, evidence only' },
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
      notPinned: 'The source sends no ETag and no checksum for the whole file, so one exact content cannot be named.',
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
        { algorithm: 'md5', digest: '4d7e0a19b3c85f62e1a70d94c8b3f517', scope: 'full object', origin: 'Listing ETag, evidence only' },
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
        { algorithm: 'md5', digest: 'c21b7f40a5d9e386b0f14c72ad85e903', scope: 'full object', origin: 'Listing ETag, evidence only' },
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
  let hash = hashOf(text)
  let out = ''
  for (let index = 0; index < length; index += 1) {
    hash = Math.imul(hash ^ (index + 1), 16777619) >>> 0
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
      digests: genome ? [{ algorithm: 'md5', digest: etag, scope: 'full object', origin: 'Listing ETag, evidence only' }] : [],
      refreshed: LISTED_AT,
      notPinned: genome ? undefined : 'The source sends no ETag and no checksum for the whole file, so one exact content cannot be named.',
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

// The marker a file row carries: where the bytes come from, and whether the version is pinned.
export function exampleMark(bucket: string, key: string): string | null {
  const external = mockFile(bucket, key)?.external
  if (!external) return null
  return external.notPinned ? 'Not pinned' : 'From a source'
}

export interface ContentSources {
  references: string[]
  followedBy: string[]
  follows: string[]
  imports: string[]
}

// Where the files of a bucket come from. A bucket not listed here reads as an ordinary one.
export const CONTENT_SOURCES: Record<string, ContentSources> = {
  bakrep: {
    references: ['49 public buckets at s3.gi.denbi.de: about 50 million files, nothing copied'],
    followedBy: [],
    follows: [],
    imports: [],
  },
  'spire-db': {
    references: [],
    followedBy: ['spire-public in the group Open Data follows this bucket, as references'],
    follows: ['This bucket follows spire-staging in the group Genome Lab, continuously'],
    imports: [],
  },
  'reads-edge': {
    references: [],
    followedBy: [],
    follows: [],
    imports: ['Storage backend sequencer-share: 5,210 files registered in place, not copied'],
  },
  [ORDINARY_BUCKET]: {
    references: ['12 files of spire-db, read from there when needed'],
    followedBy: ['lab-archive on node-2 follows this bucket, once a day'],
    follows: [],
    imports: [],
  },
}

export function contentSources(bucket: string): ContentSources {
  return CONTENT_SOURCES[bucket] ?? CONTENT_SOURCES[ORDINARY_BUCKET]
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
  const named = new Map<string, string[]>()
  for (const suffix of suffixes) {
    const [area, node, bucket] = suffix.split('/')
    if (area !== 'data' || !node || !bucket) continue
    named.set(bucket, [...(named.get(bucket) ?? []), node])
  }
  return [...named].flatMap(([bucket, nodes]) => {
    const found = mockBucket(bucket)
    const missing = found && isMulti(found) ? grantGap(nodes, found.members.map((member) => member.nodeId)) : []
    return missing.length ? [{ bucket, missing }] : []
  })
}
