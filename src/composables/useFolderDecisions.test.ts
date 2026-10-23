import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { readAction, readFolder } from '@/lib/deviceApi'

const folders = ref([
  readFolder({ folder_id: 'f1', root: '/home/me/Lab/Runs' }),
  readFolder({ folder_id: 'f2', root: '/home/me/Lab/Reports' }),
])
const actionLog = vi.fn()
const clientA = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'a' }
const clientB = { baseUrl: 'http://127.0.0.1:9001/api/v1', token: 'b' }
const deviceClient = ref<typeof clientA | null>(clientA)

vi.mock('@/composables/useSyncedFolders', () => ({ useSyncedFolders: () => ({ folders, actionLog }) }))
vi.mock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ deviceClient }) }))

const record = (action: string, path: string, at_ms: number) => readAction({ action, path, at_ms })

// Each store keeps a watch on the device; a scope per case lets it go afterwards.
const scopes: EffectScope[] = []

async function decisions() {
  const { useFolderDecisions } = await import('./useFolderDecisions')
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useFolderDecisions())!
}

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

beforeEach(() => {
  actionLog.mockReset()
  deviceClient.value = clientA
})

describe('folder decisions', () => {
  it('merges every folder log, newest first, and drops what it cannot word', async () => {
    actionLog.mockImplementation(async (id: string) =>
      id === 'f1'
        ? [record('keep_local', 'a.csv', 10), record('mystery', 'x', 99)]
        : [record('replace_local', 'b.csv', 20)],
    )
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('ready')
    expect(found.partial.value).toBe(false)
    expect(found.items.value.map((item) => [item.folder, item.text])).toEqual([
      ['Reports', 'Used the Aruna version of b.csv'],
      ['Runs', 'Kept your version of a.csv'],
    ])
    expect(found.latest.value?.folder).toBe('Reports')
  })

  it('can read the log of one folder only', async () => {
    actionLog.mockResolvedValue([record('keep_local', 'a.csv', 10)])
    const found = await decisions()

    await found.load('f2')

    expect(actionLog).toHaveBeenCalledTimes(1)
    expect(actionLog).toHaveBeenCalledWith('f2')
    expect(found.items.value[0]?.folder).toBe('Reports')
  })

  it('says so when only some folders answered', async () => {
    actionLog.mockImplementation(async (id: string) => {
      if (id === 'f2') throw new Error('gone')
      return [record('keep_local', 'a.csv', 10)]
    })
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('ready')
    expect(found.partial.value).toBe(true)
    expect(found.items.value).toHaveLength(1)
  })

  it('reports an unserved route instead of an empty history', async () => {
    actionLog.mockRejectedValue(new ApiError(404, 'nope'))
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('unsupported')
    expect(found.items.value).toEqual([])
  })

  it('shows a failed choice as failed and keeps the reason', async () => {
    actionLog.mockResolvedValue([
      readAction({ action: 'replace_local', path: 'a.csv', at_ms: 5, outcome: 'failed', message: 'disk full' }),
      readAction({ action: 'replace_local', path: 'b.csv', at_ms: 6, outcome: 'stale' }),
    ])
    const found = await decisions()

    await found.load('f1')

    expect(found.items.value.map((item) => [item.outcome, item.text])).toEqual([
      ['stale', 'Did not use the Aruna version of b.csv: the file changed again first'],
      ['failed', 'Could not use the Aruna version of a.csv: disk full'],
    ])
  })

  it('keeps the error when every folder failed, apart from an empty list', async () => {
    actionLog.mockRejectedValue(new Error('the node is busy'))
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('error')
    expect(found.error.value).toBe('the node is busy')
    expect(found.partial.value).toBe(false)
    expect(found.items.value).toEqual([])
  })

  it('empties the list at once when another folder is asked for, and drops the late answer of the old one', async () => {
    const slow = deferred<ReturnType<typeof record>[]>()
    actionLog.mockImplementation((id: string) => (id === 'f1' ? Promise.resolve([record('keep_local', 'a.csv', 10)]) : slow.promise))
    const found = await decisions()
    await found.load('f1')
    expect(found.items.value).toHaveLength(1)

    const pending = found.load('f2')
    expect(found.items.value).toEqual([])
    expect(found.state.value).toBe('loading')

    // The owner moved on to the first folder again before f2 answered.
    actionLog.mockImplementation(async () => [record('keep_local', 'again.csv', 30)])
    await found.load('f1')
    slow.resolve([record('replace_local', 'late.csv', 99)])
    await pending

    expect(found.items.value.map((item) => item.text)).toEqual(['Kept your version of again.csv'])
  })

  it('drops an answer that arrives after the device changed and reads again for the new one', async () => {
    const slow = deferred<ReturnType<typeof record>[]>()
    actionLog.mockReturnValueOnce(slow.promise).mockResolvedValue([record('keep_local', 'new-device.csv', 20)])
    const found = await decisions()
    const pending = found.load('f1')

    deviceClient.value = clientB
    await vi.waitFor(() => expect(found.items.value.map((item) => item.text)).toEqual(['Kept your version of new-device.csv']))
    slow.resolve([record('keep_local', 'old-device.csv', 10)])
    await pending

    expect(found.items.value.map((item) => item.text)).toEqual(['Kept your version of new-device.csv'])
    expect(found.state.value).toBe('ready')
    expect(actionLog).toHaveBeenCalledTimes(2)
  })

  it('waits as offline while there is no device and reads again when one returns', async () => {
    actionLog.mockResolvedValue([record('keep_local', 'a.csv', 10)])
    const found = await decisions()
    await found.load('f1')

    deviceClient.value = null
    await vi.waitFor(() => expect(found.state.value).toBe('offline'))
    expect(found.items.value).toEqual([])

    deviceClient.value = clientB
    await vi.waitFor(() => expect(found.state.value).toBe('ready'))
    expect(found.items.value).toHaveLength(1)
  })

  it('says the device is absent instead of an empty history', async () => {
    deviceClient.value = null
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('offline')
    expect(actionLog).not.toHaveBeenCalled()
  })
})
