// What the portal shows of a bucket stored on more nodes. The node answers with
// ids and states only, so a figure the node does not report stays absent here.
import type { DistributedResponse, MemberStateName, StrategyName } from '@/lib/api'
import type { Coverage, DataStrategy, MemberState, PresetId, RangeMode } from '@/lib/distributedMock'

export interface DistributedMember {
  nodeId: string
  state: MemberState
  strategy: DataStrategy
  coverage: Coverage
  /** Absent when the node does not report how far the member is behind. */
  lag?: string
  unreachableSince?: string
  /** The member coordinates a range that cannot be reached. */
  unreachable?: boolean
  /** False until the member node signed its admission. */
  admitted?: boolean
}

export interface DistributedRange {
  id: string
  lower: string
  upper: string
  /** The node that writes the range. */
  coordinator: string
  epoch: number
  /** Nodes that keep a copy of the range. */
  replicas: string[]
  objects?: number
  bytes?: number
  refreshed?: string
  /** The coordinator is unreachable, so writes to the range are refused. */
  degraded?: boolean
  degradedSince?: string
}

export interface DistributedBucket {
  name: string
  preset: PresetId
  members: DistributedMember[]
  ranges: DistributedRange[]
  refresh?: string
  mode?: RangeMode
  searchIndex?: boolean
  created?: string
  /** Set for a bucket read from a node. */
  live?: LiveState
}

export interface LiveState {
  setId: string
  groupId: string
  pending: boolean
  serving: boolean
  conflicted: boolean
  changesUnavailable: boolean
  recommendedGrant: string
}

// An ordinary bucket lives on one node. Only a bucket on more nodes has the Nodes tab.
export function isMulti(bucket: DistributedBucket): boolean {
  return bucket.members.length > 1
}

export function isDegraded(range: DistributedRange): boolean {
  return range.degraded ?? Boolean(range.degradedSince)
}

export function degradedRanges(bucket: DistributedBucket): DistributedRange[] {
  return bucket.ranges.filter(isDegraded)
}

/** Role paths like data/node-1/bakrep/** by bucket: the nodes each one names. */
export function grantTargets(suffixes: readonly string[]): Map<string, string[]> {
  const named = new Map<string, string[]>()
  for (const suffix of suffixes) {
    const [area, node, bucket] = suffix.split('/')
    if (area !== 'data' || !node || !bucket) continue
    named.set(bucket, [...(named.get(bucket) ?? []), node])
  }
  return named
}

const STATES: Record<MemberStateName, MemberState> = {
  created: 'created',
  catching_up: 'catching up',
  ready: 'ready',
  leaving: 'leaving',
  failed: 'failed',
}

const STRATEGIES: Record<StrategyName, DataStrategy> = {
  copy: 'copy',
  copy_on_use: 'copy on use',
  cache_on_use: 'cache on use',
  stream: 'stream',
}

const EDGE_PRESETS: Record<string, PresetId> = {
  'copy on use': 'copy-edge',
  'cache on use': 'cache-edge',
  stream: 'stream-edge',
}

function presetOf(members: DistributedMember[], ranges: DistributedRange[]): PresetId {
  const edge = members.find((member) => member.strategy !== 'copy')
  if (edge) return EDGE_PRESETS[edge.strategy]
  if (ranges.length > 1 || members.some((member) => member.coverage === 'assigned')) {
    return ranges.some((range) => range.replicas.length) ? 'sharding-replicas' : 'sharding'
  }
  return members.length > 2 ? 'mirror' : 'two-node'
}

function isoTime(ms: number | null | undefined): string | undefined {
  return typeof ms === 'number' ? new Date(ms).toISOString() : undefined
}

/** The view of one status answer. Ranges name nodes, not member ids. */
export function fromStatus(status: DistributedResponse): DistributedBucket {
  const nodeOf = new Map(status.members.map((member) => [member.member_id, member.node_id]))
  const ranges = status.ranges.map((range): DistributedRange => ({
    id: range.range_id,
    lower: range.lower,
    upper: range.upper ?? '',
    coordinator: range.coordinator_node ?? nodeOf.get(range.coordinator) ?? range.coordinator,
    epoch: range.epoch,
    replicas: range.replicas.map((id) => nodeOf.get(id) ?? id),
    degraded: range.degraded,
    degradedSince: isoTime(range.unreachable_since_ms),
  }))
  const members = status.members.map((member): DistributedMember => {
    const since = ranges
      .filter((range) => range.degraded && range.coordinator === member.node_id)
      .map((range) => range.degradedSince)
      .filter((time): time is string => Boolean(time))
      .sort()[0]
    return {
      nodeId: member.node_id,
      state: STATES[member.state] ?? 'created',
      strategy: STRATEGIES[member.strategy] ?? 'copy',
      coverage: member.coverage,
      unreachableSince: since,
      admitted: member.admitted,
      unreachable: ranges.some((range) => range.degraded && range.coordinator === member.node_id),
    }
  })
  return {
    name: status.bucket,
    preset: presetOf(members, ranges),
    members,
    ranges,
    live: {
      setId: status.set_id,
      groupId: status.group_id,
      pending: status.phase === 'pending',
      serving: status.serving,
      conflicted: status.conflicted,
      changesUnavailable: status.configuration_changes_unavailable,
      recommendedGrant: status.recommended_grant,
    },
  }
}
