// What the portal shows of a bucket stored on more nodes. The node answers with
// ids and states only, so a figure the node does not report stays absent here.
import type { BehaviourName, CreateDistributedRequest, DistributedResponse, MemberStateName, StrategyName } from '@/lib/api'
import {
  MAX_RANGES,
  MIN_MEMBERS,
  splitKeys,
  type Coverage,
  type DataStrategy,
  type MemberState,
  type Placement,
  type PresetId,
  type RangeMode,
} from '@/lib/distributedMock'

export interface DistributedMember {
  /** The id of the membership; a node that left and joined again has two. Absent in example data. */
  memberId?: string
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
  /** The member ids behind `coordinator` and `replicas`, for the changes that name members. */
  coordinatorId?: string
  replicaIds?: string[]
  /** The range this one was split from. */
  lineage?: string
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
  /** Open transfers of ranges, with nodes instead of member ids. */
  transfers: LiveTransfer[]
  /** Set once a deletion is prepared: writes have stopped. */
  deletion: LiveDeletion | null
  /** This node applies no more changes of the set: it leaves or the set is deleted. */
  publicationsClosed: boolean
}

export interface LiveTransfer {
  id: string
  rangeId: string
  from: string
  to: string
  epoch: number
  /** What the former coordinator does afterwards. */
  role: 'replica' | 'leave'
  /** Writes to the range fail until the new coordinator takes over. */
  fenced: boolean
  completed: boolean
}

export interface LiveDeletion {
  /** Every coordinator fenced its ranges, so the member buckets are being deleted. */
  committed: boolean
  /** The nodes of the coordinators that still have to fence their ranges. */
  waiting: string[]
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

/** The bucket is being deleted: writes have stopped. */
export function isDeleting(bucket: DistributedBucket): boolean {
  return Boolean(bucket.live?.deletion)
}

/** Transfers that are not finished yet. */
export function openTransfers(bucket: DistributedBucket): LiveTransfer[] {
  return (bucket.live?.transfers ?? []).filter((transfer) => !transfer.completed)
}

export interface TransferChoice {
  /** Ready copies of the range: only these can take it over. */
  offered: DistributedMember[]
  /** The other members and why they cannot. */
  refused: { member: DistributedMember; reason: string }[]
}

/** Who can take over a range. The new coordinator must already hold a ready copy of it. */
export function transferChoice(bucket: DistributedBucket, range: DistributedRange): TransferChoice {
  const copies = new Set(range.replicaIds ?? [])
  const offered: DistributedMember[] = []
  const refused: TransferChoice['refused'] = []
  for (const member of bucket.members) {
    if (member.memberId === range.coordinatorId) continue
    const copy = member.memberId ? copies.has(member.memberId) : range.replicas.includes(member.nodeId)
    if (!copy) refused.push({ member, reason: 'Keeps no copy of this range' })
    else if (member.state !== 'ready') refused.push({ member, reason: `Is ${member.state}, not ready` })
    else if (member.strategy !== 'copy') refused.push({ member, reason: 'Keeps no full copy' })
    else offered.push(member)
  }
  return { offered, refused }
}

/** Why a member cannot be removed now, or null. */
export function leaveBlock(bucket: DistributedBucket, member: DistributedMember): string | null {
  if (member.state === 'leaving') return 'Is leaving already'
  const writes = bucket.ranges.filter((range) => (range.coordinatorId ? range.coordinatorId === member.memberId : range.coordinator === member.nodeId)).length
  return writes ? `Writes ${writes} ${writes === 1 ? 'range' : 'ranges'}. Move them first.` : null
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
    coordinatorId: range.coordinator,
    replicaIds: range.replicas,
    ...(range.lineage ? { lineage: range.lineage } : {}),
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
      memberId: member.member_id,
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
      transfers: (status.transfers ?? []).map((transfer): LiveTransfer => ({
        id: transfer.transfer_id,
        rangeId: transfer.range_id,
        from: nodeOf.get(transfer.from) ?? transfer.from,
        to: nodeOf.get(transfer.to) ?? transfer.to,
        epoch: transfer.epoch,
        role: transfer.role === 'leave' ? 'leave' : 'replica',
        fenced: transfer.fenced,
        completed: transfer.completed,
      })),
      deletion: status.deletion
        ? { committed: status.deletion.committed, waiting: status.deletion.waiting.map((id) => nodeOf.get(id) ?? id) }
        : null,
      publicationsClosed: status.publications_closed ?? false,
    },
  }
}

const STRATEGY_NAMES: Record<DataStrategy, StrategyName> = {
  copy: 'copy',
  'copy on use': 'copy_on_use',
  'cache on use': 'cache_on_use',
  stream: 'stream',
}

export const BEHAVIOURS: Record<RangeMode, BehaviourName> = {
  passthrough: 'passthrough',
  'fill first': 'fill_first',
  'serve and fill': 'serve_and_fill',
}

export const REFRESH_SECONDS: Record<string, number> = {
  '15m': 900,
  '1h': 3_600,
  '6h': 21_600,
  '24h': 86_400,
  '7d': 604_800,
}

const isSharded = (placement: Placement) => placement.preset.startsWith('sharding')

/** The reason a placement cannot be created yet, or null. */
export function placementProblem(placement: Placement): string | null {
  const copies = placement.members.filter((member) => member.strategy === 'copy')
  const limits = draftProblem({ ...defaultDraft(), splitObjects: placement.settings.splitObjects, splitBytes: placement.settings.splitBytes })
  if (limits) return limits
  if (placement.members.length < MIN_MEMBERS) return 'Choose at least two nodes.'
  if (!copies.length) return 'Choose at least one node that keeps copies.'
  if (!isSharded(placement)) return null
  if (placement.preset === 'sharding-replicas' && copies.length < 2) return 'A copy of each range needs two nodes that keep copies.'
  const keys = splitKeys(placement.settings)
  if (keys.length + 1 > MAX_RANGES) return `At most ${MAX_RANGES} ranges.`
  if (keys.some((key, index) => index > 0 && key <= keys[index - 1])) return 'Split keys must be in order, one per line.'
  return null
}

/** The create request for a bucket on several nodes. Nodes that keep no copy are edges. */
export function createRequest(name: string, placement: Placement): CreateDistributedRequest {
  const { settings } = placement
  const sharded = isSharded(placement)
  return {
    bucket: name,
    layout: sharded ? 'sharding' : 'replica',
    nodes: placement.members.filter((member) => member.strategy === 'copy').map((member) => member.nodeId),
    ...(sharded ? { boundaries: splitKeys(settings), replicas: placement.preset === 'sharding-replicas' ? 1 : 0 } : {}),
    edges: placement.members
      .filter((member) => member.strategy !== 'copy')
      .map((member) => ({ node_id: member.nodeId, strategy: STRATEGY_NAMES[member.strategy] as Exclude<StrategyName, 'copy'> })),
    settings: {
      refresh_secs: REFRESH_SECONDS[settings.refresh],
      range_behaviour: BEHAVIOURS[settings.mode],
      search_index: settings.index,
      split_objects: wholeNumber(settings.splitObjects),
      split_bytes: wholeNumber(settings.splitBytes),
    },
  }
}

export interface SettingsDraft {
  refresh: string
  /** `member` leaves the behaviour to each node's data strategy. */
  mode: RangeMode | 'member'
  index: boolean
  public: boolean
  /** Whole numbers as typed; empty means never. */
  splitObjects: string
  splitBytes: string
}

/** What a missing field means to the node, which replaces the whole object. */
export function defaultDraft(): SettingsDraft {
  return { refresh: 'off', mode: 'member', index: false, public: false, splitObjects: '', splitBytes: '' }
}

function wholeNumber(value: string): number | null {
  const text = value.trim()
  return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : null
}

/** The reason the typed limits cannot be sent, or null. */
export function draftProblem(draft: SettingsDraft): string | null {
  for (const [value, name] of [[draft.splitObjects, 'objects'], [draft.splitBytes, 'bytes']] as const) {
    if (value.trim() && wholeNumber(value) === null) return `The split limit for ${name} must be a whole number above zero.`
  }
  return null
}

export function settingsBody(draft: SettingsDraft): NonNullable<CreateDistributedRequest['settings']> {
  return {
    refresh_secs: REFRESH_SECONDS[draft.refresh] ?? null,
    range_behaviour: draft.mode === 'member' ? null : BEHAVIOURS[draft.mode],
    search_index: draft.index,
    public: draft.public,
    split_objects: wholeNumber(draft.splitObjects),
    split_bytes: wholeNumber(draft.splitBytes),
  }
}
