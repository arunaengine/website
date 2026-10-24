import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'

const desktop = vi.hoisted(() => ({ on: true }))
const realmInfo = ref<{ nodes: RealmNodeInfo[] } | null>(null)
const identity = ref<{ nodeId: string; realm: string } | null>(null)

vi.mock('@/lib/desktop', () => ({ isDesktop: () => desktop.on }))
vi.mock('./useAruna', () => ({ useAruna: () => ({ nodeInfo: ref(null), realmInfo }) }))
vi.mock('./useDeviceStatus', () => ({ useDeviceStatus: () => ({ identity }) }))

const { useRealmNodes } = await import('./useRealmNodes')

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
  identity.value = { nodeId: 'device0001aaaa', realm: 'r' }
  realmInfo.value = {
    nodes: [
      node('node1aaaa0001', 'server', { name: 'node-1' }, 'Giessen'),
      node('node2bbbb0002', 'server', {}, 'Heidelberg'),
      node('device0001aaaa', 'user'),
      node('device0002bbbb', 'user', { device: 'lab-laptop' }),
    ],
  }
})

describe('place names in the desktop', () => {
  it('names each place in words and keeps kind and id for the tooltip', () => {
    const { displayName, nodeById } = useRealmNodes()

    expect(displayName('node1aaaa0001')).toBe('node-1 · Giessen')
    expect(displayName('node2bbbb0002')).toBe('node2bbbb0002.example.org · Heidelberg')
    expect(displayName('device0001aaaa')).toBe('This computer')
    expect(displayName('device0002bbbb')).toBe('lab-laptop')
    expect(nodeById('device0002bbbb')?.title).toMatch(/^device device0/)
  })

  it('keeps the web labels as they are', () => {
    desktop.on = false
    const { displayName, nodeById } = useRealmNodes()

    expect(displayName('node1aaaa0001')).toBe('node-1')
    expect(displayName('device0001aaaa')).toMatch(/^device /)
    expect(nodeById('node1aaaa0001')?.title).toBe('node1aaaa0001')
  })
})
