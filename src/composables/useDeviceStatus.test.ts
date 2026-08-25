import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const RUNNING = {
  state: 'running',
  enrolled: true,
  apiBaseUrl: 'http://127.0.0.1:34116/api/v1',
  nodeId: 'n1',
  realm: 'R1',
  version: null,
  uptimeSeconds: null,
  message: null,
}

type Push = (status: Record<string, unknown>) => void

let push: Push = () => {}
const unlisten = vi.fn()
const nodeStatus = vi.fn(async () => RUNNING)
const onNodeStatus = vi.fn(async (handler: Push) => {
  push = handler
  return unlisten
})

vi.mock('@/lib/desktop', () => ({ isDesktop: () => true }))
vi.mock('@/lib/desktopBridge', () => ({ nodeStatus }))
vi.mock('@/lib/desktopEvents', () => ({ onNodeStatus }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ authToken: ref('token') }) }))

// The status is a module singleton shared by every desktop surface, so each
// case takes a graph of its own instead of a leftover refcount.
async function load() {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('window', {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  })
  return (await import('./useDeviceStatus')).useDeviceStatus()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('watching the node', () => {
  it('takes what the shell pushes and lets go', async () => {
    const device = await load()
    device.start()
    await vi.waitFor(() => expect(onNodeStatus).toHaveBeenCalled())

    push({ ...RUNNING, state: 'starting', enrolled: false })
    expect(device.state.value).toBe('starting')
    expect(device.label.value).toBe('starting')

    device.stop()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('shares one listener between watchers', async () => {
    const device = await load()
    device.start()
    device.start()
    await vi.waitFor(() => expect(onNodeStatus).toHaveBeenCalledTimes(1))

    device.stop()
    expect(unlisten).not.toHaveBeenCalled()
    device.stop()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('drops a listener that arrived after the last stop', async () => {
    const device = await load()
    let settle: (off: typeof unlisten) => void = () => {}
    onNodeStatus.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)))

    device.start()
    await vi.waitFor(() => expect(onNodeStatus).toHaveBeenCalled())
    device.stop()
    settle(unlisten)

    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1))
  })
})
