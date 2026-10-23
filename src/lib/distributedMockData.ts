// Example data for the distributed bucket mock. All values are made up.
import type { Coverage, DataStrategy, MemberState, PresetId, RangeMode } from '@/lib/distributedMock'

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
  description: string
  members: MockMember[]
  ranges: MockRange[]
  refresh: string
  mode: RangeMode
  searchIndex: boolean
  created: string
}

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
    description: 'Registered files of 49 public S3 buckets at de.NBI, about 50 million files.',
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
    description: 'SPIRE database releases. Downloads spread over the copies.',
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
    description: 'Sequencing reads at node-1, read through from node-5 without a local copy.',
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
]

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
}

export interface SourceDigest {
  algorithm: string
  digest: string
  scope: 'full object' | 'composite'
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
]

export function mockObject(id: string): MockObject | undefined {
  return MOCK_OBJECTS.find((object) => object.id === id)
}

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

export interface SearchHit {
  kind: 'dataset' | 'file'
  title: string
  where: string
  relation: string
  file?: string
}

export const SEARCH_QUERY = 'Escherichia coli genome'

export const SEARCH_HITS: readonly SearchHit[] = [
  { kind: 'dataset', title: 'E. coli genomes, 2025 release', where: 'Genome Lab', relation: '1,284 files in bakrep' },
  { kind: 'file', title: 'bakrep-v2-data-007/GCF_000005845.2/genome.fna.gz', where: 'bakrep', relation: 'Used by E. coli genomes, 2025 release', file: 'genome' },
  { kind: 'file', title: 'bakrep-v2-data-007/GCF_000005845.2/annotation.gff3.gz', where: 'bakrep', relation: 'Used by bakrep collection', file: 'annotation' },
  { kind: 'dataset', title: 'bakrep collection', where: 'Genome Lab', relation: 'Describes all of bakrep' },
  { kind: 'file', title: 'bakrep-v2-data-031/GCF_003697165.2/genome.fna.gz', where: 'bakrep', relation: 'Used by bakrep collection' },
  { kind: 'file', title: 'bakrep-v2-data-044/GCF_000008865.2/genome.fna.gz', where: 'bakrep', relation: 'Used by bakrep collection' },
  { kind: 'dataset', title: 'Escherichia coli K-12 reference annotation', where: 'Genome Lab', relation: 'No files in a distributed bucket' },
  { kind: 'file', title: 'release-2026-10/escherichia_coli_mags.tsv.zst', where: 'spire-db', relation: 'Used by SPIRE release 2026-10' },
]

export function bucketFiles(bucket: string): MockObject[] {
  return MOCK_OBJECTS.filter((object) => object.bucket === bucket)
}

export function mockFile(bucket: string, key: string): MockObject | undefined {
  return MOCK_OBJECTS.find((object) => object.bucket === bucket && object.key === key)
}
