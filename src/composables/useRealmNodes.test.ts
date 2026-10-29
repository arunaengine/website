import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'

const desktop = vi.hoisted(() => ({ on: true }))
const realmInfo = ref<{ nodes: RealmNodeInfo[] } | null>(null)
const identity = ref<{ nodeId: string; realm: string } | null>(null)
const nodeInfo = ref<{ node: { peer_id: string } } | null>(null)

vi.mock('@/lib/desktop', () => ({ isDesktop: () => desktop.on }))
vi.mock('./useAruna', () => ({ useAruna: () => ({ nodeInfo, realmInfo }) }))
vi.mock('./useDeviceStatus', () => ({ useDeviceStatus: () => ({ identity }) }))

const { computerName, useRealmNodes } = await import('./useRealmNodes')

function node(id: string, kind: RealmNodeInfo['kind'], labels: Record<string, string> = {}, location?: string): RealmNodeInfo {
  return {
    node_id: id,
    kind,
    configured: true,
    present: true,
    connection_status: 'connected',
    placement: location ? { location, weight: 1, full: false, draining: false } : null,
    info: {
      executors: [],
      labels,
      urls: { api: `https://${id}.example.org/api/v1` },
      utilization: { storage_bytes_used: 0, heartbeat_at_ms: 0 },
      updated_at_ms: 0,
    },
  }
}

beforeEach(() => {
  desktop.on = true
  nodeInfo.value = null
  identity.value = { nodeId: 'device0001aaaa', realm: 'r' }
  realmInfo.value = {
    nodes: [
      node('node1aaaa0001', 'server', { name: 'node-1' }, 'Giessen'),
      node('node2bbbb0002', 'server', {}, 'Heidelberg'),
      node('device0001aaaa', 'user'),
      node('device0002bbbb', 'user', { device: 'lab-laptop' }, 'default'),
    ],
  }
})

describe('place names in the desktop', () => {
  it('names each place in words and keeps kind and id for the tooltip', () => {
    const { displayName, nodeById } = useRealmNodes()

    expect(displayName('node1aaaa0001')).toBe('node-1, Giessen')
    expect(displayName('node2bbbb0002')).toBe('node2bbbb0002, Heidelberg')
    expect(displayName('device0001aaaa')).toBe('This computer')
    expect(displayName('device0002bbbb')).toBe('lab-laptop')
    expect(nodeById('device0002bbbb')?.title).toMatch(/^device device0/)
    expect(nodeById('node1aaaa0001')?.name).toBe('node-1')
    expect(nodeById('device0001aaaa')?.name).toBe('This computer')
  })

  it('keeps the web labels as they are', () => {
    desktop.on = false
    const { displayName, nodeById } = useRealmNodes()

    expect(displayName('node1aaaa0001')).toBe('node-1')
    // A node without a name goes by the first part of its API host, never by its id.
    expect(displayName('device0001aaaa')).toBe('device0001aaaa')
    expect(displayName('node2bbbb0002')).toBe('node2bbbb0002')
    expect(nodeById('node1aaaa0001')?.title).toBe('node1aaaa0001')
  })

  it('names a node by its realm display name first, everywhere', () => {
    realmInfo.value = { nodes: [{ ...node('node1aaaa0001', 'server', { name: 'node-1' }, 'Giessen'), display_name: 'Giessen storage' }] }
    desktop.on = false
    expect(useRealmNodes().displayName('node1aaaa0001')).toBe('Giessen storage')
    desktop.on = true
    expect(useRealmNodes().displayName('node1aaaa0001')).toBe('Giessen storage, Giessen')
    // The given name alone, without the place the desktop adds, for a crate's device.
    expect(useRealmNodes().nodeById('node1aaaa0001')?.given).toBe('Giessen storage')
    realmInfo.value = { nodes: [node('node1aaaa0002', 'user', {})] }
    expect(useRealmNodes().nodeById('node1aaaa0002')?.given).toBeNull()
  })
})

describe('places to pick', () => {
  it('offers no device on the web', () => {
    desktop.on = false
    nodeInfo.value = { node: { peer_id: 'node1aaaa0001' } }
    const { targets, isTarget } = useRealmNodes()

    expect(targets.value.map((node) => node.nodeId)).toEqual(['node1aaaa0001', 'node2bbbb0002'])
    expect([isTarget('device0001aaaa'), isTarget('node2bbbb0002'), isTarget('unknown')]).toEqual([false, true, true])
  })

  it('offers this computer in the desktop app, never another device', () => {
    nodeInfo.value = { node: { peer_id: 'device0001aaaa' } }
    const { targets, isTarget } = useRealmNodes()

    expect(targets.value.map((node) => [node.nodeId, node.label])).toEqual([
      ['node1aaaa0001', 'node-1, Giessen'],
      ['node2bbbb0002', 'node2bbbb0002, Heidelberg'],
      ['device0001aaaa', 'This computer'],
    ])
    expect(isTarget('device0002bbbb')).toBe(false)
  })
})

describe('computerName', () => {
  const device = (labels: Record<string, string>) => ({ info: { labels } }) as unknown as RealmNodeInfo

  it('uses the name the realm knows this computer by, else "This computer", never its id', () => {
    expect(computerName(device({ device: 'Microbiology laptop' }))).toBe('Microbiology laptop')
    expect(computerName(device({ name: 'Lab PC', device: 'old' }))).toBe('Lab PC')
    expect(computerName(device({}))).toBe('This computer')
    expect(computerName({ ...device({ device: 'old' }), display_name: 'Lab laptop' })).toBe('Lab laptop')
    expect(computerName(undefined)).toBe('This computer')
  })
})
