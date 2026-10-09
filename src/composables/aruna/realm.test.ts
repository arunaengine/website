import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '@/lib/api'
import { toBase64Url } from '@/lib/federation/descriptor'

vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiRequest: vi.fn() }))

const BYTES = Array.from({ length: 32 }, (_, index) => index)
const REALM_ID = toBase64Url(Uint8Array.from(BYTES))

const state = await import('./state')
const { loadInfo, realm } = await import('./realm')

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
