import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return {
    useAruna: () => ({
      apiBaseUrl: ref('https://api.test/api/v1'),
      authToken: ref('token-1'),
      currentUser: ref({ id: 'u1' }),
    }),
  }
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
