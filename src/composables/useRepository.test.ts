import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionEpoch = ref(0)
const searchRepositoryRecords = vi.fn()
const listRepositoryConnectors = vi.fn()
const listRepositoryKinds = vi.fn()

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  searchRepositoryRecords,
  listRepositoryConnectors,
  listRepositoryKinds,
}))

const { useRepositorySearch, useRepositoryConnectors, useRepositoryKinds } = await import('./useRepository')

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
  searchRepositoryRecords.mockReset()
  listRepositoryConnectors.mockReset()
  listRepositoryKinds.mockReset()
})

afterEach(() => vi.useRealTimers())

describe('repository search', () => {
  it('asks nothing for an empty query', async () => {
    const scope = effectScope()
    const search = scope.run(() => useRepositorySearch(() => ({ groupId: 'g1', connectorId: 'c1' }), { delayMs: 300 }))!
    await settle()
    search.query.value = '  '
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    expect(searchRepositoryRecords).not.toHaveBeenCalled()
    expect(search.idle.value).toBe(true)
    expect(search.loading.value).toBe(false)
    scope.stop()
  })

  it('stops paging at the repository result window', async () => {
    searchRepositoryRecords.mockResolvedValue({ hits: { total: 50_000, hits: [] }, links: { next: 'more' } })
    const scope = effectScope()
    const search = scope.run(() => useRepositorySearch(() => ({ groupId: 'g1', connectorId: 'c1' }), { delayMs: 0, size: 25 }))!
    search.query.value = 'ocean'
    await nextTick()
    await settle()
    expect(search.pageCount.value).toBe(400)

    search.page.value = 400
    await settle()
    expect(search.hasNext.value).toBe(false)
    scope.stop()
  })

  it('waits for a typing pause and drops the answer for older text', async () => {
    const first = deferred<unknown>()
    searchRepositoryRecords.mockReturnValueOnce(first.promise).mockResolvedValueOnce(page('ocean'))
    const scope = effectScope()
    const search = scope.run(() => useRepositorySearch(() => ({ groupId: 'g1', connectorId: 'c1' }), { delayMs: 300 }))!
    await settle()
    expect(searchRepositoryRecords).not.toHaveBeenCalled()

    search.query.value = 'oce'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    search.query.value = 'ocean'
    await nextTick()
    await vi.advanceTimersByTimeAsync(299)
    expect(searchRepositoryRecords).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    first.resolve(page('stale'))
    await settle()

    expect(searchRepositoryRecords).toHaveBeenCalledTimes(2)
    expect(searchRepositoryRecords.mock.calls[1][0]).toMatchObject({ q: 'ocean', page: 1 })
    expect(search.hits.value.map((hit) => hit.title)).toEqual(['ocean'])
    scope.stop()
  })

  it('does not search without a connector and never shows a pending page as empty', async () => {
    const pending = deferred<unknown>()
    searchRepositoryRecords.mockReturnValueOnce(pending.promise)
    const connectorId = ref('')
    const scope = effectScope()
    const search = scope.run(() => useRepositorySearch(() => ({ groupId: 'g1', connectorId: connectorId.value })))!
    search.query.value = 'ocean'
    await vi.advanceTimersByTimeAsync(400)
    await settle()
    expect(searchRepositoryRecords).not.toHaveBeenCalled()

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

describe('repository kinds', () => {
  it('asks the node once per session', async () => {
    sessionEpoch.value = 101
    listRepositoryKinds.mockResolvedValue([{ kind: 'invenio', capabilities: { pull: true }, profiles: [] }])
    const scope = effectScope()
    const first = scope.run(() => useRepositoryKinds())!
    const second = scope.run(() => useRepositoryKinds())!
    await settle()

    expect(listRepositoryKinds).toHaveBeenCalledTimes(1)
    expect(second.kindOf('invenio')?.capabilities.pull).toBe(true)
    expect(first.kindOf('ena')).toBeNull()
    scope.stop()
  })

  it('asks again after a failed answer', async () => {
    sessionEpoch.value = 102
    listRepositoryKinds.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    const scope = effectScope()
    const state = scope.run(() => useRepositoryKinds())!
    await settle()
    expect(state.error.value).toBe('offline')
    expect(state.kinds.value).toBeNull()

    await state.load()
    expect(state.kinds.value).toEqual([])
    expect(listRepositoryKinds).toHaveBeenCalledTimes(2)
    scope.stop()
  })
})
