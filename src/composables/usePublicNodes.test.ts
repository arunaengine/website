import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  currentUser: { value: null as { id: string } | null },
  realmInfo: { value: null as Record<string, unknown> | null },
  getNodeInfo: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { usePublicNodes } = await import('./usePublicNodes')
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  aruna.currentUser.value = null
  aruna.realmInfo.value = {
    management_urls: ['https://api.node-1.test'],
    public_nodes: [
      { node_id: 'n1', api_url: 'https://api.node-1.test' },
      { node_id: 'n2', api_url: 'https://api.node-2.test' },
    ],
  }
  aruna.getNodeInfo.mockImplementation(async (id: string) => {
    if (id === 'n2') throw new Error('down')
    return {}
  })
})

describe('usePublicNodes', () => {
  it('lists the published nodes once each answered, online by their own info', async () => {
    const scope = effectScope()
    const nodes = scope.run(() => usePublicNodes(ref([])))!
    expect(nodes.value).toEqual([])
    await settle()

    expect(nodes.value.map((node) => [node.node_id, node.kind, node.present, node.rest_url])).toEqual([
      ['n1', 'management', true, 'https://api.node-1.test'],
      ['n2', 'server', false, 'https://api.node-2.test'],
    ])
    scope.stop()
  })

  it('keeps the realm records when there are any, and never probes for a session', async () => {
    const record = { node_id: 'n9', kind: 'server', present: true } as RealmNodeInfo
    const scope = effectScope()
    const nodes = scope.run(() => usePublicNodes(ref([record])))!
    await settle()
    expect(nodes.value).toEqual([record])

    aruna.currentUser.value = { id: 'u' }
    const signedIn = scope.run(() => usePublicNodes(ref([])))!
    await settle()
    expect(signedIn.value).toEqual([])
    expect(aruna.getNodeInfo).not.toHaveBeenCalled()
    scope.stop()
  })
})
