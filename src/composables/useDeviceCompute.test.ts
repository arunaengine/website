import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCompute, type DeviceCompute } from '@/lib/deviceApi'

const client = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner' }
const read = vi.fn()

vi.mock('@/lib/deviceApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/deviceApi')>()),
  getCompute: () => read(),
}))
vi.mock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ deviceClient: ref(client) }) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

// The compute state is a singleton: one graph per case.
async function load() {
  vi.resetModules()
  return (await import('./useDeviceCompute')).useDeviceCompute()
}

beforeEach(() => read.mockReset())

describe('device compute', () => {
  it('waits for a read that is already in flight instead of returning before it', async () => {
    const slow = deferred<DeviceCompute>()
    read.mockReturnValue(slow.promise)
    const compute = await load()
    const first = compute.load()

    let joined = false
    const second = compute.ensureLoaded().then(() => (joined = true))
    await Promise.resolve()
    expect(joined).toBe(false)

    slow.resolve(readCompute({ enabled: true }))
    await Promise.all([first, second])

    expect(joined).toBe(true)
    expect(compute.compute.value?.enabled).toBe(true)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('does not read again once it has an answer', async () => {
    read.mockResolvedValue(readCompute({ enabled: false }))
    const compute = await load()

    await compute.ensureLoaded()
    await compute.ensureLoaded()

    expect(read).toHaveBeenCalledTimes(1)
  })
})
