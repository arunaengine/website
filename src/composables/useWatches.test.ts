import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  const arunaState = {
    apiBaseUrl: ref('https://api.test/api/v1'),
    authToken: ref('token-1'),
    currentUser: ref<{ id: string } | null>({ id: 'u1' }),
    sessionEpoch: ref(0),
  }
  return { useAruna: () => arunaState, arunaState }
})

interface Reply {
  status?: number
  payload?: unknown
}

function stubFetch(replies: Reply[]): string[] {
  const urls: string[] = []
  const queue = [...replies]
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      urls.push(String(url))
      const next = queue.shift() ?? { payload: { watches: [] } }
      const status = next.status ?? 200
      if (status === 204 || status >= 400) return new Response(null, { status })
      return new Response(JSON.stringify(next.payload ?? {}), { status })
    }),
  )
  return urls
}

// The composable is a module singleton, so every case starts from a fresh one.
async function freshWatches() {
  vi.resetModules()
  const module = await import('@/composables/useWatches')
  return module.useWatches()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('watch feature availability', () => {
  it('hides the feature when the list route is absent', async () => {
    stubFetch([{ status: 404 }])
    const watches = await freshWatches()

    await watches.loadWatches()

    expect(watches.available.value).toBe(false)
    expect(watches.listError.value).toBeNull()
  })

  it('reports a refused list without hiding the feature', async () => {
    stubFetch([{ status: 403 }])
    const watches = await freshWatches()

    await watches.loadWatches()

    expect(watches.available.value).toBe(true)
    expect(watches.listError.value).toBeTruthy()
  })

  it('keeps the feature after a refused create', async () => {
    stubFetch([{ payload: { watches: [] } }, { status: 403 }])
    const watches = await freshWatches()
    await watches.loadWatches()

    // resetModules gives the composable its own ApiError class, so match the status.
    await expect(watches.createWatch('s3/g1/n1/reef/', ['data_uploaded'])).rejects.toMatchObject({
      status: 403,
    })

    expect(watches.available.value).toBe(true)
  })

  it('keeps the feature after a failed delete', async () => {
    stubFetch([{ payload: { watches: [] } }, { status: 403 }])
    const watches = await freshWatches()
    await watches.loadWatches()

    await expect(watches.deleteWatch('w1')).rejects.toMatchObject({ status: 403 })

    expect(watches.available.value).toBe(true)
    expect(watches.deletingIds.value).toEqual([])
  })

  it('finds a watch by its prefix whatever its events are', async () => {
    stubFetch([
      {
        payload: {
          watches: [
            { id: 'w1', path_prefix: 's3/g1/n1/reef/', events: ['sync_failed'], created_at_ms: 2 },
            { id: 'w2', path_prefix: 'meta/g1/surveys', events: ['metadata_created'], created_at_ms: 1 },
          ],
        },
      },
    ])
    const watches = await freshWatches()

    await watches.loadWatches()

    expect(watches.findWatch('s3/g1/n1/reef/')?.id).toBe('w1')
    expect(watches.findWatch('s3/g1/n1/other/')).toBeUndefined()
  })
})

describe('old watches an edit could not delete', () => {
  function sessionStore() {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    }
  }

  it('keeps a failed one across a remount and deletes it on the next try', async () => {
    const storage = sessionStore()
    stubFetch([{ status: 503 }, { status: 204 }])
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' }, sessionStorage: storage })
    const first = await freshWatches()

    await expect(first.removePending(first.startAction('s3/g1/n1/reef/'), ['old'])).rejects.toMatchObject({ status: 503 })
    expect(first.pendingRemovals('s3/g1/n1/reef/')).toEqual(['old'])

    // A fresh module stands for the view mounted again in the same browser session.
    const again = await freshWatches()
    expect(again.pendingRemovals('s3/g1/n1/reef/')).toEqual(['old'])
    await again.removePending(again.startAction('s3/g1/n1/reef/'))
    expect(again.pendingRemovals('s3/g1/n1/reef/')).toEqual([])
  })

  it('counts an already deleted watch as done', async () => {
    const storage = sessionStore()
    stubFetch([{ status: 404 }])
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' }, sessionStorage: storage })
    const watches = await freshWatches()

    await watches.removePending(watches.startAction('s3/g1/n1/reef/'), ['gone'])

    expect(watches.pendingRemovals('s3/g1/n1/reef/')).toEqual([])
  })

  it('leaves the rest of a cleanup with its account when the session switches', async () => {
    const storage = sessionStore()
    let answer: () => void = () => undefined
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => (answer = () => resolve(new Response(null, { status: 204 })))),
    )
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' }, sessionStorage: storage })
    const watches = await freshWatches()
    const { arunaState } = (await import('@/composables/useAruna')) as unknown as {
      arunaState: {
        authToken: { value: string }
        currentUser: { value: { id: string } | null }
        sessionEpoch: { value: number }
      }
    }
    const prefix = 's3/g1/n1/reef/'
    const userKey = (id: string) => `aruna.watch.pending:https://api.test/api/v1|${id}|${prefix}`
    storage.setItem(userKey('u1'), JSON.stringify(['a', 'b']))
    storage.setItem(userKey('u2'), JSON.stringify(['y1']))

    const cleanup = watches.removePending(watches.startAction(prefix))
    // Another account signs in while the first delete is on its way.
    arunaState.currentUser.value = { id: 'u2' }
    arunaState.authToken.value = 'token-2'
    arunaState.sessionEpoch.value += 1
    answer()

    await expect(cleanup).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-1')
    expect(JSON.parse(storage.getItem(userKey('u1')) ?? '[]')).toEqual(['b'])
    expect(JSON.parse(storage.getItem(userKey('u2')) ?? '[]')).toEqual(['y1'])
  })

  it('stops after the last delete when the session switched during it', async () => {
    const storage = sessionStore()
    let answer: () => void = () => undefined
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => (answer = () => resolve(new Response(null, { status: 204 })))),
    )
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' }, sessionStorage: storage })
    const watches = await freshWatches()
    const { arunaState } = (await import('@/composables/useAruna')) as unknown as {
      arunaState: { sessionEpoch: { value: number } }
    }
    const prefix = 's3/g1/n1/reef/'
    const action = watches.startAction(prefix)

    const cleanup = watches.removePending(action, ['only'])
    arunaState.sessionEpoch.value += 1
    answer()

    // The one delete ran for its own account; whatever followed in the action must not.
    await expect(cleanup).rejects.toMatchObject({ name: 'AbortError', message: 'The API session changed.' })
    expect(watches.pendingRemovals(prefix)).toEqual([])
  })

  it('stops when the caller scope moved on', async () => {
    const storage = sessionStore()
    stubFetch([{ status: 204 }])
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' }, sessionStorage: storage })
    const watches = await freshWatches()
    let here = true
    const action = watches.startAction('s3/g1/n1/reef/', () => here)

    here = false

    await expect(watches.removePending(action, ['old'])).rejects.toThrow('The folder changed. Nothing was saved.')
    expect(storage.getItem(action.key)).toBe(JSON.stringify(['old']))
  })

  it('records a replaced watch under the key the action started with', async () => {
    const storage = sessionStore()
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' }, sessionStorage: storage })
    const watches = await freshWatches()
    const { arunaState } = (await import('@/composables/useAruna')) as unknown as {
      arunaState: { currentUser: { value: { id: string } | null }; sessionEpoch: { value: number } }
    }
    // The mocked account state is shared by every case, so this one sets its own start.
    arunaState.currentUser.value = { id: 'u1' }
    const action = watches.startAction('s3/g1/n1/reef/')
    arunaState.currentUser.value = { id: 'u3' }
    arunaState.sessionEpoch.value += 1

    watches.notePending(action, ['old'])

    expect(storage.getItem(action.key)).toBe(JSON.stringify(['old']))
    expect(action.key).toContain('|u1|')
  })
})
