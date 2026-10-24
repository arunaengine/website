// Static types and helpers for the node mock. Nothing here talks to a
// node: the mock only shows how the agreed design could look in the portal.
import { featureEnabled } from '@/lib/config'
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

// The mock shows example data in the Data section. It is on when the deployment feature
// `distributedMock` is on in portal-config.json, or for a build started with
// VITE_ARUNA_DISTRIBUTED_MOCK=1.
export function mockEnabled(): boolean {
  return featureEnabled('distributedMock') || import.meta.env.VITE_ARUNA_DISTRIBUTED_MOCK === '1'
}

export const SHARD_HOST_LABEL = 'aruna-engine.org/shard-host'
export const REALM_ID = 'k3V9xQ2mT7aLd0RpYc8WnHfJ5uBsE1gZtO4iXvNq6Ay'
export const DATABASES_PATH = `/${REALM_ID}/admin/databases`
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
  members: Pick<MemberDraft, 'strategy' | 'coverage'>[]
  mode: RangeMode
}

const COPY_ALL = { strategy: 'copy', coverage: 'all' } as const
const COPY_PART = { strategy: 'copy', coverage: 'assigned' } as const

export const PRESETS: readonly Preset[] = [
  {
    id: 'two-node',
    label: 'Copy on two nodes',
    description: 'One node writes, the other keeps a full copy. Reads work on both.',
    members: [COPY_ALL, COPY_ALL],
    mode: 'passthrough',
  },
  {
    id: 'mirror',
    label: 'Copy on every chosen node',
    description: 'Full copies on several nodes. Downloads spread over the copies.',
    members: [COPY_ALL, COPY_ALL, COPY_ALL],
    mode: 'passthrough',
  },
  {
    id: 'sharding',
    label: 'Split across nodes',
    description: 'The files are divided into ranges. Each range has one node that writes.',
    members: [COPY_PART, COPY_PART, COPY_PART, COPY_PART],
    mode: 'passthrough',
  },
  {
    id: 'sharding-replicas',
    label: 'Split with copies',
    description: 'Like splitting, and every range also has a copy on the next node.',
    members: [COPY_PART, COPY_PART, COPY_PART, COPY_PART],
    mode: 'passthrough',
  },
  {
    id: 'copy-edge',
    label: 'Edge node, copy on use',
    description: 'An edge node fetches a file when it is first read and then keeps it.',
    members: [COPY_ALL, { strategy: 'copy on use', coverage: 'all' }],
    mode: 'serve and fill',
  },
  {
    id: 'cache-edge',
    label: 'Edge node, cache on use',
    description: 'An edge node caches files that are read. The cache has a size limit.',
    members: [COPY_ALL, { strategy: 'cache on use', coverage: 'all' }],
    mode: 'serve and fill',
  },
  {
    id: 'stream-edge',
    label: 'Edge node, stream',
    description: 'An edge node knows the files but keeps no bytes. Every read goes to a holder.',
    members: [COPY_ALL, { strategy: 'stream', coverage: 'all' }],
    mode: 'passthrough',
  },
]

export function presetById(id: PresetId): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
}

// The preset's roles on the given nodes, in order. Fewer nodes than roles leave the last roles out.
export function membersFor(id: PresetId, nodeIds: readonly string[]): MemberDraft[] {
  return presetById(id)
    .members.slice(0, nodeIds.length)
    .map((member, index) => ({ nodeId: nodeIds[index], ...member }))
}

export interface PlannedRange {
  id: string
  coordinator: string
  replica: string | null
}

// Coordinators go round the members. A replica sits on the next member, as the node plans it.
export function planRanges(count: number, nodeIds: readonly string[], replicas: boolean): PlannedRange[] {
  if (nodeIds.length < 2 && replicas) return []
  return Array.from({ length: nodeIds.length ? count : 0 }, (_, index) => ({
    id: `r-${String(index).padStart(3, '0')}`,
    coordinator: nodeIds[index % nodeIds.length],
    replica: replicas ? nodeIds[(index + 1) % nodeIds.length] : null,
  }))
}

export function roleLabel(preset: PresetId, index: number, member: MemberDraft): string {
  if (preset === 'sharding' || preset === 'sharding-replicas') return 'Coordinates ranges'
  if (index === 0) return 'Coordinator'
  return member.strategy === 'copy' ? 'Replica' : 'Edge'
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

export interface CreateSettings {
  keys: string
  refresh: string
  mode: RangeMode
  index: boolean
}

export const REFRESH_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: '15m', label: 'Every 15 minutes' },
  { value: '1h', label: 'Every hour' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '24h', label: 'Every 24 hours' },
  { value: '7d', label: 'Every 7 days' },
]

export const MAX_RANGES = 4096

export function defaultSettings(preset: PresetId): CreateSettings {
  return { keys: '', refresh: 'off', mode: presetById(preset).mode, index: true }
}

// The lower bounds of the second and later ranges, one per line.
export function splitKeys(settings: CreateSettings): string[] {
  return settings.keys.split('\n').map((key) => key.trim()).filter(Boolean)
}

export function rangeTotal(settings: CreateSettings): number {
  return splitKeys(settings).length + 1
}

export const MIN_MEMBERS = 2

// A quiet line for lists: where the bucket is stored.
export function storedLabel(preset: PresetId, nodes: number): string {
  if (nodes < 2) return 'This node'
  if (preset === 'sharding' || preset === 'sharding-replicas') return `Split across ${nodes} nodes`
  if (preset === 'two-node' || preset === 'mirror') return `Copies on ${nodes} nodes`
  return `On ${nodes} nodes`
}

export interface Placement {
  several: boolean
  preset: PresetId
  members: MemberDraft[]
  settings: CreateSettings
}

// Unchanged behaviour: the bucket is stored on this node only.
export function defaultPlacement(): Placement {
  return { several: false, preset: 'two-node', members: [], settings: defaultSettings('two-node') }
}

export function placementLabel(placement: Placement): string {
  return placement.several ? storedLabel(placement.preset, placement.members.length) : 'This node'
}

// The questions of the storage feature guide, by the section title that answers each.
export const STORAGE_QUESTIONS = {
  describe: 'I want to describe or publish data that belongs together',
  elsewhere: 'The data is already somewhere else',
  nodes: 'The same bucket should be on several nodes, or it is too large for one node',
  sync: 'I need a separate second bucket that follows the first',
  rules: 'Same node, fast or archive storage',
  sites: 'Data must not leave a site',
} as const

export type StorageQuestion = keyof typeof STORAGE_QUESTIONS
