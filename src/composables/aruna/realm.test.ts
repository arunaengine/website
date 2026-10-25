import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '@/lib/api'
import { toBase64Url } from '@/lib/federation/descriptor'

vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiRequest: vi.fn() }))

const desktop = vi.hoisted(() => ({ on: false }))
vi.mock('@/lib/desktop', async (original) => ({
  ...(await original<typeof import('@/lib/desktop')>()),
  isDesktop: () => desktop.on,
}))

const BYTES = Array.from({ length: 32 }, (_, index) => index)
const REALM_ID = toBase64Url(Uint8Array.from(BYTES))

const state = await import('./state')
const { loadInfo, loadRealmView, realm } = await import('./realm')

function serve(descriptor: unknown, description = 'Test_Deploy_Realm', realmId = REALM_ID) {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === '/system/realm') return { realm_id: realmId, description, nodes: [], oidc_providers: [] }
    if (path === '/system/realm/descriptor') {
      if (descriptor instanceof Error) throw descriptor
      return descriptor
    }
    return {}
  })
}

const signed = (name: string, realmId: number[] = BYTES) => ({ payload: { realm_id: realmId, name }, signer: 'Realm' })

beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  state.sessionEpoch.value++
  state.realmInfo.value = null
  state.federationName.value = ''
})

describe('realm name', () => {
  it('shows the federation name instead of the description', async () => {
    serve(signed(' Realm A '))
    await loadInfo()
    expect(realm.value.name).toBe('Realm A')
    expect(realm.value.description).toBe('Test_Deploy_Realm')
  })

  it('falls back to the description when the realm has no federation settings', async () => {
    serve(new ApiError(404, 'No federation settings'))
    await loadInfo()
    expect(realm.value.name).toBe('Test_Deploy_Realm')
  })

  it('ignores a descriptor that names another realm', async () => {
    serve(signed('Realm B', BYTES.map((byte) => 255 - byte)))
    await loadInfo()
    expect(realm.value.name).toBe('Test_Deploy_Realm')
  })

  it('keeps a known name until the node says there is none', async () => {
    serve(signed('Realm A'))
    await loadInfo()
    serve(new ApiError(503, 'Unavailable'))
    await loadInfo()
    expect(realm.value.name).toBe('Realm A')
    serve(new TypeError('Failed to fetch'))
    await loadInfo()
    expect(realm.value.name).toBe('Realm A')
    serve(new ApiError(404, 'No federation settings'))
    await loadInfo()
    expect(realm.value.name).toBe('Test_Deploy_Realm')
  })

  it('drops a known name when the realm changed', async () => {
    serve(signed('Realm A'))
    await loadInfo()
    serve(new ApiError(503, 'Unavailable'), 'Other realm', toBase64Url(Uint8Array.from(BYTES.map((byte) => 255 - byte))))
    await loadInfo()
    expect(realm.value.name).toBe('Other realm')
  })

  it('falls back to the short id when neither name is set', async () => {
    serve(new ApiError(404, 'No federation settings'), '')
    await loadInfo()
    expect(realm.value.name).toBe(REALM_ID.slice(0, 8))
  })
})

describe('realm view from a realm node', () => {
  const member = (node_id: string, kind: string, api?: string) => ({ node_id, kind, info: api ? { urls: { api } } : undefined })

  beforeEach(() => {
    state.authToken.value = 'session-token'
    state.realmInfo.value = {
      realm_id: REALM_ID,
      management_urls: ['https://mgmt.test/'],
      nodes: [member('device', 'user', 'http://127.0.0.1:34115'), member('server', 'server', 'https://server.test')],
    } as never
  })

  function answer(failing: string[] = [], realmId = REALM_ID, anonymous: string[] = []) {
    vi.mocked(apiRequest).mockImplementation(async (path, _options, client) => {
      const base = client?.baseUrl ?? ''
      if (failing.includes(base)) throw new TypeError('Failed to fetch')
      if (path === '/system/info') return { node: { peer_id: base } }
      return { realm_id: realmId, nodes: anonymous.includes(base) ? [] : [member('server', 'server')] }
    })
  }

  it('reads the management node with the session token', async () => {
    answer()

    const view = await loadRealmView()

    expect(view?.info.node.peer_id).toBe('https://mgmt.test/api/v1')
    expect(vi.mocked(apiRequest).mock.calls.map(([path, , client]) => [path, client?.baseUrl, client?.token])).toEqual([
      ['/system/info', 'https://mgmt.test/api/v1', 'session-token'],
      ['/system/realm', 'https://mgmt.test/api/v1', 'session-token'],
    ])
  })

  it('falls back to another realm member, never the device', async () => {
    answer(['https://mgmt.test/api/v1'])

    const view = await loadRealmView()

    expect(view?.info.node.peer_id).toBe('https://server.test/api/v1')
    const bases = vi.mocked(apiRequest).mock.calls.map(([, , client]) => client?.baseUrl)
    expect(bases).not.toContain('http://127.0.0.1:34115/api/v1')
  })

  it('skips a node that answers without the realm members', async () => {
    answer([], REALM_ID, ['https://mgmt.test/api/v1'])

    expect((await loadRealmView())?.info.node.peer_id).toBe('https://server.test/api/v1')
  })

  it('cancels the sibling read when one fails', async () => {
    let hanging: AbortSignal | undefined
    vi.mocked(apiRequest).mockImplementation(async (path, options, client) => {
      if (client?.baseUrl !== 'https://mgmt.test/api/v1') return path === '/system/info' ? {} : { realm_id: REALM_ID }
      if (path === '/system/info') throw new TypeError('Failed to fetch')
      hanging = options?.signal ?? undefined
      return new Promise(() => {})
    })

    await loadRealmView()

    expect(hanging?.aborted).toBe(true)
  })

  it('answers null when no node of this realm answers', async () => {
    answer(['https://mgmt.test/api/v1'], 'other-realm')

    expect(await loadRealmView()).toBeNull()
  })
})

describe('realm view while refreshing', () => {
  const member = (node_id: string, kind: string, api?: string) => ({ node_id, kind, info: api ? { urls: { api } } : undefined })

  beforeEach(() => {
    vi.useFakeTimers()
    state.realmInfo.value = {
      realm_id: REALM_ID,
      management_urls: ['https://dead.test/'],
      nodes: [member('server', 'server', 'https://server.test')],
    } as never
    // The first candidate never answers until its read is aborted.
    vi.mocked(apiRequest).mockImplementation((path, options, client) => {
      if (client?.baseUrl === 'https://dead.test/api/v1') {
        return new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
      }
      return Promise.resolve(path === '/system/info' ? { node: { peer_id: client?.baseUrl } } : { realm_id: REALM_ID, nodes: [member('server', 'server')] })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares one lookup and falls back past a hanging node', async () => {
    const first = loadRealmView()
    const refreshes = [loadRealmView(), loadRealmView()]
    await vi.advanceTimersByTimeAsync(5_000)

    const views = await Promise.all([first, ...refreshes])

    expect(views.map((view) => view?.info.node.peer_id)).toEqual(Array(3).fill('https://server.test/api/v1'))
    expect(views[1]).toBe(views[0])
    const bases = vi.mocked(apiRequest).mock.calls.map(([, , client]) => client?.baseUrl)
    expect(bases.filter((base) => base === 'https://dead.test/api/v1')).toHaveLength(2)
  })

  it('tries the node that answered last first on the next refresh', async () => {
    const first = loadRealmView()
    await vi.advanceTimersByTimeAsync(5_000)
    await first
    vi.mocked(apiRequest).mockClear()

    const view = await loadRealmView()

    expect(view?.info.node.peer_id).toBe('https://server.test/api/v1')
    expect(vi.mocked(apiRequest).mock.calls.map(([, , client]) => client?.baseUrl)).not.toContain('https://dead.test/api/v1')
  })
})

describe('usage on the desktop', () => {
  const member = (node_id: string, kind: string, api?: string) => ({ node_id, kind, info: api ? { urls: { api } } : undefined })
  const totals = (objects: number) => ({ buckets: 1, objects, logical_bytes: 0, referenced_bytes: 0 })
  const DEVICE = 'http://127.0.0.1:34115/api/v1'
  const MGMT = 'https://mgmt.test/api/v1'

  function serveUsage(realmOnline: boolean) {
    vi.mocked(apiRequest).mockImplementation(async (path, _options, client) => {
      const base = client?.baseUrl ?? ''
      if (path === '/system/realm') {
        return { realm_id: REALM_ID, nodes: [member('server', 'server')], oidc_providers: [], management_urls: ['https://mgmt.test/'] }
      }
      if (path === '/system/usage') {
        if (base === DEVICE || base === '') return { buckets: 1, objects: 3, referenced_bytes: 5, realm: totals(3), metadata_documents: 1 }
        if (!realmOnline) throw new TypeError('Failed to fetch')
        return { buckets: 9, objects: 90, referenced_bytes: 9, realm: totals(90), metadata_documents: 40 }
      }
      if (path === '/system/info') return { node: { peer_id: base } }
      throw new ApiError(404, 'none')
    })
  }

  beforeEach(() => {
    desktop.on = true
    state.usageInfo.value = null
    state.apiBaseUrl.value = DEVICE
  })

  afterEach(() => {
    desktop.on = false
  })

  it('takes the realm part from a realm node and keeps the device top level', async () => {
    serveUsage(true)

    await loadInfo()
    expect(state.usageInfo.value?.realm).toBeUndefined()
    await vi.waitFor(() => expect(state.usageInfo.value?.realm?.objects).toBe(90))

    expect(state.usageInfo.value).toMatchObject({ objects: 3, referenced_bytes: 5, metadata_documents: 40 })
    const reads = vi.mocked(apiRequest).mock.calls.filter(([path, , client]) => path === '/system/usage' && client?.baseUrl === MGMT)
    expect(reads).toHaveLength(1)
  })

  it('keeps the realm part of the same session and realm across a refresh', async () => {
    serveUsage(true)
    await loadInfo()
    await vi.waitFor(() => expect(state.usageInfo.value?.realm?.objects).toBe(90))

    await loadInfo()

    expect(state.usageInfo.value).toMatchObject({ objects: 3, realm: { objects: 90 }, metadata_documents: 40 })
  })

  it('does not carry the realm part into a new session', async () => {
    serveUsage(true)
    await loadInfo()
    await vi.waitFor(() => expect(state.usageInfo.value?.realm?.objects).toBe(90))
    serveUsage(false)
    state.sessionEpoch.value++
    await loadInfo()

    expect(state.usageInfo.value?.realm).toBeUndefined()
    expect(state.usageInfo.value?.metadata_documents).toBeUndefined()
  })

  it('ignores a late realm answer of a previous session', async () => {
    let release: (usage: unknown) => void = () => {}
    let asked = false
    vi.mocked(apiRequest).mockImplementation(async (path, _options, client) => {
      const base = client?.baseUrl ?? ''
      if (path === '/system/realm') return { realm_id: REALM_ID, nodes: [member('server', 'server')], oidc_providers: [], management_urls: ['https://mgmt.test/'] }
      if (path === '/system/info') return { node: { peer_id: base } }
      if (path === '/system/usage' && base === MGMT) {
        asked = true
        return new Promise((resolve) => (release = resolve))
      }
      if (path === '/system/usage') return { buckets: 1, objects: 3, referenced_bytes: 5, realm: totals(3) }
      throw new ApiError(404, 'none')
    })
    await loadInfo()
    await vi.waitFor(() => expect(asked).toBe(true))
    state.sessionEpoch.value++
    release({ buckets: 9, objects: 90, referenced_bytes: 9, realm: totals(90), metadata_documents: 40 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.usageInfo.value?.realm).toBeUndefined()
  })

  it('leaves the realm part unknown when no realm node answers', async () => {
    serveUsage(false)

    await loadInfo()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.usageInfo.value).toMatchObject({ objects: 3, referenced_bytes: 5 })
    expect(state.usageInfo.value?.realm).toBeUndefined()
    expect(state.usageInfo.value?.metadata_documents).toBeUndefined()
  })

  it('shows the node answer unchanged on the web', async () => {
    desktop.on = false
    serveUsage(true)

    await loadInfo()

    expect(state.usageInfo.value).toMatchObject({ objects: 3, realm: { objects: 3 }, metadata_documents: 1 })
    expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path === '/system/usage')).toHaveLength(1)
  })
})
