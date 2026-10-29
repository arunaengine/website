import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn(async () => ({})), loadInfo: vi.fn(async () => undefined) }))
vi.mock('@/composables/aruna/state', () => ({ request: mocks.request }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ loadInfo: mocks.loadInfo }) }))
const { useNodeNames } = await import('./useNodeNames')

describe('useNodeNames', () => {
  it('names a node through the realm route and a device through its owner route, then reads the realm again', async () => {
    const { renameNode, renameDevice } = useNodeNames()
    await renameNode('node 1', 'Giessen storage 1')
    await renameDevice('dev1', null)

    expect(mocks.request).toHaveBeenNthCalledWith(1, '/system/realm/nodes/node%201', { method: 'PATCH', body: '{"display_name":"Giessen storage 1"}' })
    expect(mocks.request).toHaveBeenNthCalledWith(2, '/access/users/me/devices/dev1', { method: 'PATCH', body: '{"display_name":null}' })
    expect(mocks.loadInfo).toHaveBeenCalledTimes(2)
  })

  it('passes a refusal on and reads nothing then', async () => {
    mocks.request.mockRejectedValueOnce(new Error('forbidden'))
    mocks.loadInfo.mockClear()
    await expect(useNodeNames().renameNode('n1', 'x')).rejects.toThrow('forbidden')
    expect(mocks.loadInfo).not.toHaveBeenCalled()
  })
})
