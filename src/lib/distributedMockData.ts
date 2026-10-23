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

// Four coordinators take the ranges in turn, a replica sits in the other location.
const BAKREP_NODES = ['node-1', 'node-3', 'node-2', 'node-5']
const BAKREP_REPLICA: Record<string, string> = {
  'node-1': 'node-3',
  'node-2': 'node-5',
  'node-3': 'node-1',
  'node-5': 'node-2',
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
