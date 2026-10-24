import { describe, expect, it } from 'vitest'
import type { DistributedResponse } from '@/lib/api'
import { degradedRanges, fromStatus } from './distribution'

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
