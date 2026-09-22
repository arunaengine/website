import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionEpoch = ref(0)
const searchInvenioRecords = vi.fn()
const listRepositoryConnectors = vi.fn()

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  searchInvenioRecords,
  listRepositoryConnectors,
}))

const { useInvenioSearch, useRepositoryConnectors } = await import('./useInvenio')

function page(title: string) {
  return { hits: { total: 1, hits: [{ id: title, metadata: { title } }] } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionEpoch.value = 0
  searchInvenioRecords.mockReset()
  listRepositoryConnectors.mockReset()
})

afterEach(() => vi.useRealTimers())

describe('invenio search', () => {
  it('waits for a typing pause and drops the answer for older text', async () => {
    const first = deferred<unknown>()
    searchInvenioRecords.mockResolvedValueOnce(page('initial')).mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(page('ocean'))
    const scope = effectScope()
    const search = scope.run(() => useInvenioSearch(() => ({ groupId: 'g1', connectorId: 'c1' }), { delayMs: 300 }))!
    await settle()
    expect(search.hits.value.map((hit) => hit.title)).toEqual(['initial'])

    search.query.value = 'oce'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    search.query.value = 'ocean'
    await nextTick()
    await vi.advanceTimersByTimeAsync(299)
    expect(searchInvenioRecords).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    first.resolve(page('stale'))
    await settle()

    expect(searchInvenioRecords).toHaveBeenCalledTimes(3)
    expect(searchInvenioRecords.mock.calls[2][0]).toMatchObject({ q: 'ocean', page: 1 })
    expect(search.hits.value.map((hit) => hit.title)).toEqual(['ocean'])
    scope.stop()
  })

  it('does not search without a connector and never shows a pending page as empty', async () => {
    const pending = deferred<unknown>()
    searchInvenioRecords.mockReturnValueOnce(pending.promise)
    const connectorId = ref('')
    const scope = effectScope()
    const search = scope.run(() => useInvenioSearch(() => ({ groupId: 'g1', connectorId: connectorId.value })))!
    await settle()
    expect(searchInvenioRecords).not.toHaveBeenCalled()

    connectorId.value = 'c1'
    await settle()
    expect(search.loading.value).toBe(true)
    expect(search.result.value).toBeNull()
    pending.resolve(page('found'))
    await settle()
    expect(search.loading.value).toBe(false)
    scope.stop()
  })
})

describe('repository connectors', () => {
  it('ignores a list that answers after the group changed', async () => {
    const slow = deferred<unknown[]>()
    listRepositoryConnectors.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([{ connector_id: 'b' }])
    const groupId = ref('g1')
    const scope = effectScope()
    const state = scope.run(() => useRepositoryConnectors(() => groupId.value))!
    groupId.value = 'g2'
    await settle()
    slow.resolve([{ connector_id: 'a' }])
    await settle()

    expect(state.connectors.value).toEqual([{ connector_id: 'b' }])
    scope.stop()
  })

  it('forgets the list when the session changes', async () => {
    const later = deferred<unknown[]>()
    listRepositoryConnectors.mockResolvedValueOnce([{ connector_id: 'a' }]).mockReturnValueOnce(later.promise)
    const scope = effectScope()
    const state = scope.run(() => useRepositoryConnectors(() => 'g1'))!
    await settle()
    expect(state.connectors.value).toHaveLength(1)

    sessionEpoch.value++
    await settle()
    expect(state.connectors.value).toBeNull()
    scope.stop()
  })
})
