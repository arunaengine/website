import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const RUNNING = {
  state: 'running',
  enrolled: true,
  enrolling: false,
  ready: true,
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

const apiRequest = vi.fn(async () => ({ node: { peer_id: 'peer-1', realm_id: 'realm-1' } }))

vi.mock('@/lib/api', () => ({ apiRequest }))
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

  it('holds the device base until the node answers', async () => {
    // A listener that has only been spawned is not one to call.
    const device = await load()
    device.start()
    await vi.waitFor(() => expect(onNodeStatus).toHaveBeenCalled())

    push({ ...RUNNING, ready: false })
    expect(device.nodeBaseUrl.value).toBeNull()
    expect(device.label.value).toBe('starting')

    push(RUNNING)
    expect(device.nodeBaseUrl.value).toBe(RUNNING.apiBaseUrl)
    expect(device.label.value).toBe('online')
    device.stop()
  })

  it('says connecting while the code is redeemed', async () => {
    // A device that never joined is not set up; one redeeming a code is joining.
    const device = await load()
    device.start()
    await vi.waitFor(() => expect(onNodeStatus).toHaveBeenCalled())

    push({ ...RUNNING, enrolled: false, enrolling: true })
    expect(device.label.value).toBe('connecting')

    push({ ...RUNNING, state: 'starting', enrolled: false, enrolling: true })
    expect(device.label.value).toBe('connecting')

    push({ ...RUNNING, enrolled: false })
    expect(device.label.value).toBe('not set up')
    device.stop()
  })

  it('reads the node id from the node itself', async () => {
    // The shell reports none, so the identity comes from the node's own /info.
    const device = await load()
    device.start()

    await vi.waitFor(() => expect(device.identity.value?.nodeId).toBe('peer-1'))
    expect(apiRequest).toHaveBeenCalledWith('/info', {}, { baseUrl: RUNNING.apiBaseUrl, token: 'token' })
    device.stop()
  })

  it('drops the identity once the node stops answering', async () => {
    const device = await load()
    device.start()
    await vi.waitFor(() => expect(device.identity.value).not.toBeNull())

    push({ ...RUNNING, ready: false })
    await vi.waitFor(() => expect(device.identity.value).toBeNull())
    device.stop()
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
