import { describe, expect, it } from 'vitest'
import type { DistributedResponse } from '@/lib/api'
import { defaultSettings, type Placement, type PresetId } from '@/lib/distributedMock'
import { createRequest, degradedRanges, fromStatus, isDeleting, leaveBlock, openTransfers, placementProblem, transferChoice } from './distribution'

const NODE_A = 'a'.repeat(64)
const NODE_B = 'b'.repeat(64)
const NODE_C = 'c'.repeat(64)

function status(extra: Partial<DistributedResponse> = {}): DistributedResponse {
  return {
    set_id: 's1',
    bucket: 'bakrep',
    group_id: 'g1',
    publisher: NODE_A,
    revision: 4,
    phase: 'active',
    serving: true,
    conflicted: false,
    configuration_changes_unavailable: false,
    degraded: false,
    members: [
      { member_id: 'm1', node_id: NODE_A, state: 'ready', coverage: 'assigned', strategy: 'copy', admitted: true },
      { member_id: 'm2', node_id: NODE_B, state: 'catching_up', coverage: 'assigned', strategy: 'copy', admitted: false },
    ],
    ranges: [
      { range_id: 'r1', lower: '', upper: 'm', coordinator: 'm1', coordinator_node: NODE_A, epoch: 2, replicas: ['m2'], degraded: false },
      { range_id: 'r2', lower: 'm', coordinator: 'm2', epoch: 1, replicas: [], degraded: true, unreachable_since_ms: 1_700_000_000_000 },
    ],
    recommended_grant: '/r/g/g1/data/*/bakrep/**',
    ...extra,
  }
}

describe('status to view', () => {
  it('names ranges by node and keeps counts the node does not report absent', () => {
    const view = fromStatus(status())

    expect(view.ranges[0]).toMatchObject({ coordinator: NODE_A, replicas: [NODE_B], upper: 'm' })
    expect(view.ranges[1]).toMatchObject({ coordinator: NODE_B, upper: '' })
    expect(view.ranges[0].objects).toBeUndefined()
    expect(view.members[0].lag).toBeUndefined()
    expect(view.live?.recommendedGrant).toBe('/r/g/g1/data/*/bakrep/**')
  })

  it('marks the members and ranges behind an unreachable coordinator', () => {
    const view = fromStatus(status())

    expect(degradedRanges(view).map((range) => range.id)).toEqual(['r2'])
    expect(view.ranges[1].degradedSince).toBe('2023-11-14T22:13:20.000Z')
    expect(view.members[1]).toMatchObject({ unreachable: true, state: 'catching up', admitted: false })
    expect(view.members[0].unreachable).toBe(false)
  })

  it('reads a degraded range as degraded when the time of the last contact is unknown', () => {
    const view = fromStatus(status({
      ranges: [{ range_id: 'r1', lower: '', coordinator: 'm1', epoch: 1, replicas: [], degraded: true }],
    }))

    expect(degradedRanges(view)).toHaveLength(1)
    expect(view.ranges[0].degradedSince).toBeUndefined()
  })

  it('tells the kept-as choice from the layout', () => {
    expect(fromStatus(status()).preset).toBe('sharding-replicas')
    const replica = (nodes: string[], strategy: 'copy' | 'stream' = 'copy') => fromStatus(status({
      members: nodes.map((node, index) => ({
        member_id: `m${index}`, node_id: node, state: 'ready', coverage: 'all', strategy: index === 1 ? strategy : 'copy', admitted: true,
      })),
      ranges: [{ range_id: 'r', lower: '', coordinator: 'm0', epoch: 1, replicas: [], degraded: false }],
    })).preset
    expect(replica([NODE_A, NODE_B])).toBe('two-node')
    expect(replica([NODE_A, NODE_B, NODE_C])).toBe('mirror')
    expect(replica([NODE_A, NODE_B], 'stream')).toBe('stream-edge')
  })

  it('shows a pending set as pending', () => {
    expect(fromStatus(status({ phase: 'pending', serving: false })).live).toMatchObject({ pending: true, serving: false })
  })
})

describe('create request', () => {
  const member = (nodeId: string, strategy: Placement['members'][number]['strategy'] = 'copy') => ({ nodeId, strategy, coverage: 'all' as const })
  const placement = (preset: PresetId, members: Placement['members'], settings: Partial<Placement['settings']> = {}): Placement => ({
    several: true,
    preset,
    members,
    settings: { ...defaultSettings(preset), ...settings },
  })

  it('keeps copies on the first node and every other copy node of a replica layout', () => {
    const request = createRequest('spire', placement('mirror', [member('a'), member('b'), member('c')]))

    expect(request).toMatchObject({ bucket: 'spire', layout: 'replica', nodes: ['a', 'b', 'c'], edges: [] })
    expect(request.boundaries).toBeUndefined()
  })

  it('sends the nodes that keep no copy as edges with their strategy', () => {
    const request = createRequest('reads', placement('cache-edge', [member('a'), member('b', 'cache on use')], { mode: 'serve and fill' }))

    expect(request.nodes).toEqual(['a'])
    expect(request.edges).toEqual([{ node_id: 'b', strategy: 'cache_on_use' }])
    expect(request.settings?.range_behaviour).toBe('serve_and_fill')
  })

  it('splits at the typed keys and asks for one more copy of each range', () => {
    const request = createRequest('bakrep', placement('sharding-replicas', [member('a'), member('b'), member('c')], { keys: 'genomes/m\n\n genomes/t \n', refresh: '24h', index: false }))

    expect(request).toMatchObject({ layout: 'sharding', boundaries: ['genomes/m', 'genomes/t'], replicas: 1 })
    expect(request.settings).toMatchObject({ refresh_secs: 86_400, search_index: false })
  })

  it('leaves the refresh out while it is off', () => {
    expect(createRequest('a', placement('mirror', [member('a'), member('b')])).settings?.refresh_secs).toBeUndefined()
  })

  it('names what is missing before anything is sent', () => {
    expect(placementProblem(placement('mirror', [member('a')]))).toBe('Choose at least two nodes.')
    expect(placementProblem(placement('stream-edge', [member('a', 'stream'), member('b', 'stream')]))).toBe('Choose at least one node that keeps copies.')
    expect(placementProblem(placement('sharding-replicas', [member('a'), member('b', 'stream')]))).toBe('A copy of each range needs two nodes that keep copies.')
    expect(placementProblem(placement('sharding', [member('a'), member('b')], { keys: 'm\nb' }))).toBe('Split keys must be in order, one per line.')
    expect(placementProblem(placement('sharding', [member('a'), member('b')], { keys: 'b\nm' }))).toBeNull()
  })
})

describe('changes of a set', () => {
  const member = (id: string, node: string, state: 'ready' | 'catching_up' | 'leaving' = 'ready', strategy: 'copy' | 'stream' = 'copy') => ({
    member_id: id, node_id: node, state, coverage: 'all' as const, strategy, admitted: true,
  })
  const base = (extra: Partial<DistributedResponse> = {}): DistributedResponse => status({
    members: [member('m1', NODE_A), member('m2', NODE_B), member('m3', NODE_C, 'catching_up'), member('m4', 'd'.repeat(64)), member('m5', 'e'.repeat(64), 'ready', 'stream')],
    ranges: [
      { range_id: 'r1', lower: '', upper: 'm', coordinator: 'm1', epoch: 2, replicas: ['m2', 'm3', 'm5'], degraded: false, lineage: 'r0' },
      { range_id: 'r2', lower: 'm', coordinator: 'm1', epoch: 1, replicas: [], degraded: false },
    ],
    ...extra,
  })

  it('offers only ready copies of the range and says why the others are not offered', () => {
    const bucket = fromStatus(base())
    const choice = transferChoice(bucket, bucket.ranges[0])

    expect(choice.offered.map((item) => item.memberId)).toEqual(['m2'])
    expect(choice.refused.map((item) => [item.member.memberId, item.reason])).toEqual([
      ['m3', 'Is catching up, not ready'],
      ['m4', 'Keeps no copy of this range'],
      ['m5', 'Keeps no full copy'],
    ])
    expect(transferChoice(bucket, bucket.ranges[1]).offered).toEqual([])
  })

  it('keeps the lineage of a split range', () => {
    expect(fromStatus(base()).ranges.map((range) => range.lineage)).toEqual(['r0', undefined])
  })

  it('refuses to remove a coordinator or a member that is leaving', () => {
    const bucket = fromStatus(base({ members: [member('m1', NODE_A), member('m2', NODE_B, 'leaving'), member('m3', NODE_C)], ranges: [
      { range_id: 'r1', lower: '', coordinator: 'm1', epoch: 1, replicas: ['m2'], degraded: false },
    ] }))

    expect(leaveBlock(bucket, bucket.members[0])).toBe('Writes 1 range. Move them first.')
    expect(leaveBlock(bucket, bucket.members[1])).toBe('Is leaving already')
    expect(leaveBlock(bucket, bucket.members[2])).toBeNull()
  })

  it('names the nodes behind open transfers and a deletion that waits for a fence', () => {
    const bucket = fromStatus(base({
      transfers: [
        { transfer_id: 't1', range_id: 'r1', from: 'm1', to: 'm2', epoch: 3, role: 'leave', fenced: true, completed: false },
        { transfer_id: 't0', range_id: 'r2', from: 'm1', to: 'm2', epoch: 2, role: 'replica', fenced: true, completed: true },
      ],
      deletion: { committed: false, fenced: [], waiting: ['m1'] },
    }))

    expect(openTransfers(bucket)).toEqual([{ id: 't1', rangeId: 'r1', from: NODE_A, to: NODE_B, epoch: 3, role: 'leave', fenced: true, completed: false }])
    expect(bucket.live?.deletion).toEqual({ committed: false, waiting: [NODE_A] })
    expect(isDeleting(bucket)).toBe(true)
    expect(isDeleting(fromStatus(base()))).toBe(false)
  })

  it('reads an older node without transfers or deletion as having none', () => {
    const bucket = fromStatus(base())

    expect(bucket.live).toMatchObject({ transfers: [], deletion: null, publicationsClosed: false })
  })
})
