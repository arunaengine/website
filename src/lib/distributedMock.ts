// Static types and helpers for the distributed bucket mock. Nothing here talks to a
// node: the mock only shows how the agreed design could look in the portal.
import type { StateTone } from '@/lib/stateBadge'

export type MemberState = 'created' | 'catching up' | 'ready' | 'leaving' | 'failed'
export type DataStrategy = 'copy' | 'copy on use' | 'cache on use' | 'stream'
export type Coverage = 'all' | 'assigned'
export type RangeMode = 'passthrough' | 'fill first' | 'serve and fill'
export type PresetId =
  | 'two-node'
  | 'mirror'
  | 'sharding'
  | 'sharding-replicas'
  | 'copy-edge'
  | 'cache-edge'
  | 'stream-edge'

export const SHARD_HOST_LABEL = 'aruna-engine.org/shard-host'
export const REALM_ID = 'k3V9xQ2mT7aLd0RpYc8WnHfJ5uBsE1gZtO4iXvNq6Ay'
export const GROUP_ID = '01K8XW4C2T6B9Q1ZHDNE5A7RMF'

export interface MockNode {
  id: string
  location: string
  shardHost: boolean
  reachable: boolean
  freePercent: number
}

export const MOCK_NODES: readonly MockNode[] = [
  { id: 'node-1', location: 'Giessen', shardHost: true, reachable: true, freePercent: 61 },
  { id: 'node-2', location: 'Giessen', shardHost: true, reachable: true, freePercent: 48 },
  { id: 'node-3', location: 'Heidelberg', shardHost: true, reachable: true, freePercent: 72 },
  { id: 'node-4', location: 'Heidelberg', shardHost: false, reachable: true, freePercent: 80 },
  { id: 'node-5', location: 'Heidelberg', shardHost: true, reachable: true, freePercent: 55 },
]

export function mockNode(id: string): MockNode | undefined {
  return MOCK_NODES.find((node) => node.id === id)
}

export interface Choice<T extends string> {
  value: T
  label: string
  hint: string
}

export const STRATEGIES: readonly Choice<DataStrategy>[] = [
  { value: 'copy', label: 'Copy', hint: 'Keeps a full copy of the bytes it is responsible for.' },
  { value: 'copy on use', label: 'Copy on use', hint: 'Fetches a file on the first read and keeps it.' },
  { value: 'cache on use', label: 'Cache on use', hint: 'Fetches on the first read and may drop it later.' },
  { value: 'stream', label: 'Stream', hint: 'Keeps no bytes and reads from a holder every time.' },
]

export const COVERAGES: readonly Choice<Coverage>[] = [
  { value: 'all', label: 'All', hint: 'Knows every file record of the bucket.' },
  { value: 'assigned', label: 'Assigned', hint: 'Knows only the records of its own ranges.' },
]

export const RANGE_MODES: readonly Choice<RangeMode>[] = [
  { value: 'passthrough', label: 'Passthrough', hint: 'Reads only the asked bytes from a holder and keeps nothing.' },
  { value: 'fill first', label: 'Fill first', hint: 'Fetches the whole file, then serves the range.' },
  { value: 'serve and fill', label: 'Serve and fill', hint: 'Serves the range at once and fills the file in the background.' },
]

export interface MemberDraft {
  nodeId: string
  strategy: DataStrategy
  coverage: Coverage
}

export interface Preset {
  id: PresetId
  label: string
  description: string
  nodes: string[]
  members: Pick<MemberDraft, 'strategy' | 'coverage'>[]
  ranges: number
  mode: RangeMode
}

const COPY_ALL = { strategy: 'copy', coverage: 'all' } as const
const COPY_PART = { strategy: 'copy', coverage: 'assigned' } as const

export const PRESETS: readonly Preset[] = [
  {
    id: 'two-node',
    label: 'Two-node replica',
    description: 'One node writes, the other keeps a full copy. Reads work on both.',
    nodes: ['node-1', 'node-3'],
    members: [COPY_ALL, COPY_ALL],
    ranges: 1,
    mode: 'passthrough',
  },
  {
    id: 'mirror',
    label: 'Mirror',
    description: 'Full copies on several nodes. Downloads spread over the copies.',
    nodes: ['node-1', 'node-2', 'node-3'],
    members: [COPY_ALL, COPY_ALL, COPY_ALL],
    ranges: 1,
    mode: 'passthrough',
  },
  {
    id: 'sharding',
    label: 'Sharding',
    description: 'The key space is cut into ranges. Each range has one node that writes.',
    nodes: ['node-1', 'node-2', 'node-3', 'node-5'],
    members: [COPY_PART, COPY_PART, COPY_PART, COPY_PART],
    ranges: 8,
    mode: 'passthrough',
  },
  {
    id: 'sharding-replicas',
    label: 'Sharding with replicas',
    description: 'Like sharding, and every range also has a copy on a node in another location.',
    nodes: ['node-1', 'node-2', 'node-3', 'node-5'],
    members: [COPY_PART, COPY_PART, COPY_PART, COPY_PART],
    ranges: 8,
    mode: 'passthrough',
  },
  {
    id: 'copy-edge',
    label: 'Copy-on-use edge',
    description: 'An edge node fetches a file when it is first read and then keeps it.',
    nodes: ['node-1', 'node-5'],
    members: [COPY_ALL, { strategy: 'copy on use', coverage: 'all' }],
    ranges: 1,
    mode: 'serve and fill',
  },
  {
    id: 'cache-edge',
    label: 'Cache-on-use edge',
    description: 'An edge node caches files that are read. The cache has a size limit.',
    nodes: ['node-1', 'node-5'],
    members: [COPY_ALL, { strategy: 'cache on use', coverage: 'all' }],
    ranges: 1,
    mode: 'serve and fill',
  },
  {
    id: 'stream-edge',
    label: 'Stream edge',
    description: 'An edge node knows the files but keeps no bytes. Every read goes to a holder.',
    nodes: ['node-1', 'node-5'],
    members: [COPY_ALL, { strategy: 'stream', coverage: 'all' }],
    ranges: 1,
    mode: 'passthrough',
  },
]

export function presetById(id: PresetId): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
}

export function presetMembers(id: PresetId): MemberDraft[] {
  const preset = presetById(id)
  return preset.nodes.map((nodeId, index) => ({ nodeId, ...preset.members[index] }))
}

export interface PlannedRange {
  id: string
  coordinator: string
  replica: string | null
}

// Coordinators go round the members. A replica sits in another location when one exists.
export function planRanges(count: number, nodeIds: readonly string[], replicas: boolean): PlannedRange[] {
  return Array.from({ length: count }, (_, index) => {
    const coordinator = nodeIds[index % nodeIds.length]
    const place = mockNode(coordinator)?.location
    const other = nodeIds.filter((id) => id !== coordinator)
    const apart = other.filter((id) => mockNode(id)?.location !== place)
    const pool = apart.length ? apart : other
    const replica = replicas && pool.length ? pool[index % pool.length] : null
    return { id: `r-${String(index).padStart(3, '0')}`, coordinator, replica }
  })
}

export const MEMBER_TONE: Record<MemberState, StateTone> = {
  created: 'idle',
  'catching up': 'progress',
  ready: 'info',
  leaving: 'attention',
  failed: 'failed',
}

export function stamp(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`
}

export const GLOB_NODE = '*'

// Member nodes that a grant naming these node segments does not reach.
export function grantGap(segments: readonly string[], memberIds: readonly string[]): string[] {
  return segments.includes(GLOB_NODE) ? [] : memberIds.filter((id) => !segments.includes(id))
}

export function nodeGlob(bucket: string): string {
  return `/${REALM_ID}/g/${GROUP_ID}/data/*/${bucket}/**`
}
