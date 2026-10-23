import { describe, expect, it } from 'vitest'
import { bindSource } from './bindSource'

const nodes = [
  { nodeId: 'realm-1', kind: 'server' },
  { nodeId: 'mgmt', kind: 'management' },
  { nodeId: 'laptop', kind: 'user' },
]

describe('bind source', () => {
  it('takes a bucket on a realm node with explicit ids', () => {
    expect(bindSource(nodes, 'lab', 'realm-1', 'g1')).toEqual({ bucket: 'lab', nodeId: 'realm-1', groupId: 'g1' })
    expect(bindSource(nodes, 'lab', 'mgmt', 'g1')?.nodeId).toBe('mgmt')
  })

  it('refuses the computer’s own user node and nodes it does not know', () => {
    expect(bindSource(nodes, 'lab', 'laptop', 'g1')).toBeNull()
    expect(bindSource(nodes, 'lab', 'elsewhere', 'g1')).toBeNull()
  })

  it('refuses a source whose node or group is not named', () => {
    expect(bindSource(nodes, 'lab', null, 'g1')).toBeNull()
    expect(bindSource(nodes, 'lab', 'realm-1', null)).toBeNull()
    expect(bindSource(nodes, '', 'realm-1', 'g1')).toBeNull()
  })

  it('refuses a workspace bucket', () => {
    expect(bindSource(nodes, 'ws-run-1', 'realm-1', 'g1')).toBeNull()
  })
})
