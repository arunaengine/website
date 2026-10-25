import { defineComponent, h, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readTransfer, type DeviceTransfers } from '@/lib/deviceApi'
import { mountApp } from '@/test/clientRender'

let answer: DeviceTransfers = { uploads: [], downloads: [] }
const read = vi.fn(async () => answer)
const owner = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner' }
const client = shallowRef<typeof owner | null>(owner)

vi.mock('@/lib/deviceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceApi')>()
  return { ...actual, getTransfers: () => read() }
})
vi.mock('@/composables/useDeviceStatus', () => ({
  useDeviceStatus: () => ({ deviceClient: client }),
}))

const upload = (state: string) => readTransfer({ id: state, folder_id: 'f1', path: `${state}.txt`, state }, 'upload')

// The query is a module singleton, so each case takes a graph of its own.
async function load() {
  vi.resetModules()
  const { useDeviceTransfers } = await import('./useDeviceTransfers')
  const Page = defineComponent(() => {
    useDeviceTransfers()
    return () => h('div')
  })
  return { useDeviceTransfers, mountPage: () => mountApp(Page) }
}

beforeEach(() => {
  answer = { uploads: [], downloads: [] }
  client.value = owner
  read.mockClear()
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('device transfers', () => {
  it('hands every page the last answer at once', async () => {
    answer = { uploads: [upload('queued')], downloads: [] }
    const { useDeviceTransfers } = await load()
    await useDeviceTransfers({ poll: false }).load()

    const later = useDeviceTransfers({ poll: false })

    expect(later.state.value).toBe('ready')
    expect(later.all.value.map((transfer) => transfer.path)).toEqual(['queued.txt'])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('runs one poll for all open pages and stops with the last one', async () => {
    const { mountPage } = await load()
    const first = await mountPage()
    const second = await mountPage()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(read).toHaveBeenCalledTimes(1)

    first.app.unmount()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(read).toHaveBeenCalledTimes(2)

    second.app.unmount()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('reads every second while an upload is running', async () => {
    const { useDeviceTransfers, mountPage } = await load()
    answer = { uploads: [upload('running')], downloads: [] }
    await useDeviceTransfers({ poll: false }).load()
    const page = await mountPage()
    read.mockClear()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(read).toHaveBeenCalledTimes(1)

    answer = { uploads: [upload('queued')], downloads: [] }
    await vi.advanceTimersByTimeAsync(1_000)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(read).toHaveBeenCalledTimes(3)
    page.app.unmount()
  })

  it('drops a read from the previous session and loads the new one', async () => {
    const { useDeviceTransfers } = await load()
    const { all, state, load: run } = useDeviceTransfers({ poll: false })
    let finish: (value: DeviceTransfers) => void = () => {}
    read.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const old = run()

    client.value = null
    client.value = { ...owner, token: 'next' }
    expect(state.value).toBe('idle')
    answer = { uploads: [upload('queued')], downloads: [] }
    const next = run()
    finish({ uploads: [upload('running')], downloads: [] })
    await Promise.all([old, next])

    expect(read).toHaveBeenCalledTimes(2)
    expect(state.value).toBe('ready')
    expect(all.value.map((transfer) => transfer.path)).toEqual(['queued.txt'])
  })

  it('starts the new session empty', async () => {
    answer = { uploads: [upload('queued')], downloads: [] }
    const { useDeviceTransfers } = await load()
    await useDeviceTransfers({ poll: false }).load()

    client.value = { ...owner, token: 'next' }

    const later = useDeviceTransfers({ poll: false })
    expect(later.state.value).toBe('idle')
    expect(later.all.value).toEqual([])
  })
})
