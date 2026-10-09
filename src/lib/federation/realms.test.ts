import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sign, signedRealm } from '@/test/federation'
import { descriptorSigningBytes, verifyDescriptor } from './descriptor'
import {
  checkRealm,
  knownRealm,
  listRegistry,
  recheckRealm,
  rememberRealm,
  reloadRealms,
  savedRealms,
  setRealmSaved,
} from './realms'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() })
  reloadRealms()
})
afterEach(() => vi.unstubAllGlobals())

describe('remembered realms', () => {
  it('keeps the newest descriptor and refuses older ones', async () => {
    const newer = await verifyDescriptor((await signedRealm({ issued_at: 20 })).signed)
    expect(rememberRealm(newer, { save: true })).toBe('stored')
    const older = { ...newer, issuedAt: 10, name: 'Old name' }
    expect(rememberRealm(older)).toBe('older')
    expect(knownRealm(newer.realmId)?.name).toBe('Giessen Data')
    expect(knownRealm(newer.realmId)?.saved).toBe(true)
  })

  it('keeps a star when a newer descriptor arrives without one', async () => {
    const realm = await verifyDescriptor((await signedRealm({ issued_at: 10 })).signed)
    rememberRealm(realm, { save: true })
    rememberRealm({ ...realm, issuedAt: 11, name: 'Renamed' })
    expect(savedRealms.value.map((entry) => entry.name)).toEqual(['Renamed'])
    setRealmSaved(realm.realmId, false)
    expect(savedRealms.value).toEqual([])
    expect(knownRealm(realm.realmId)).toBeDefined()
  })

  it('survives a reload from storage', async () => {
    const realm = await verifyDescriptor((await signedRealm()).signed)
    rememberRealm(realm, { save: true })
    reloadRealms()
    expect(savedRealms.value[0]?.realmId).toBe(realm.realmId)
  })
})

describe('listRegistry', () => {
  it('keeps entries whose descriptor verifies for their realm id', async () => {
    const good = await signedRealm()
    const other = await signedRealm()
    const goodId = (await verifyDescriptor(good.signed)).realmId
    const entry = (descriptor: unknown, realmId: string) => ({
      realm_id: realmId,
      registration: {
        payload: {
          descriptor,
          kpis: { live_datasets: 12, groups: null, nodes_configured: 2 },
          observed_at: 5,
        },
      },
      received_at: 6,
      verified: true,
      stale: false,
    })
    const tampered = { ...good.signed, payload: { ...good.signed.payload, name: 'Fake' } }
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify([entry(good.signed, goodId), entry(other.signed, goodId), entry(tampered, goodId)])),
    ))
    const listed = await listRegistry('https://registry.example')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ verified: true, kpis: { groups: null } })
  })
})

describe('checkRealm', () => {
  function serve(routes: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const body = routes[String(input)]
      return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 })
    }))
  }
  const portal = 'https://data.giessen.example/.well-known/aruna-realm'
  const api = 'https://api.giessen.example/api/v1/system/realm/descriptor'

  it('saves a realm only after both routes agree', async () => {
    const { signed } = await signedRealm()
    serve({ [portal]: signed, [api]: signed })
    const result = await checkRealm('https://data.giessen.example', { save: true })
    expect(result.status).toBe('ok')
    expect(savedRealms.value).toHaveLength(1)
  })

  it('keeps the stored realm when an older descriptor comes back', async () => {
    const { signed } = await signedRealm({ issued_at: 5 })
    const stored = await verifyDescriptor(signed)
    rememberRealm({ ...stored, issuedAt: 9, name: 'Newer' }, { save: true })
    serve({ [portal]: signed, [api]: signed })
    const result = await checkRealm('https://data.giessen.example')
    expect(result.status).toBe('older')
    expect(knownRealm(stored.realmId)?.name).toBe('Newer')
  })

  it('refuses another realm than expected', async () => {
    const { signed } = await signedRealm()
    serve({ [portal]: signed, [api]: signed })
    const result = await checkRealm('https://data.giessen.example', { realmId: 'other', save: true })
    expect(result.status).toBe('mismatch')
    expect(savedRealms.value).toEqual([])
  })

  it('reports an unreachable realm by its name', async () => {
    serve({})
    const result = await checkRealm('https://data.giessen.example', { label: 'Fulda Campus' })
    expect(result).toEqual({ status: 'unreachable', message: 'Cannot reach Fulda Campus.' })
  })
})

describe('recheckRealm', () => {
  const portal = 'https://data.giessen.example/.well-known/aruna-realm'
  const api = 'https://api.giessen.example/api/v1/system/realm/descriptor'
  function serve(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) =>
      [portal, api].includes(String(input)) ? new Response(JSON.stringify(body)) : new Response('', { status: 404 }),
    ))
  }

  it('returns the details the realm serves now', async () => {
    const first = await signedRealm({ issued_at: 5 })
    const held = await verifyDescriptor(first.signed)
    const payload = { ...first.signed.payload, issued_at: 6, name: 'Giessen Data Hub' }
    serve({ payload, signer: 'Realm', signature: await sign(first.pair.privateKey, descriptorSigningBytes(payload)) })
    expect((await recheckRealm(held)).name).toBe('Giessen Data Hub')
  })

  it('refuses details older than the held ones', async () => {
    const { signed } = await signedRealm({ issued_at: 5 })
    const served = await verifyDescriptor(signed)
    serve(signed)
    await expect(recheckRealm({ ...served, issuedAt: 9 })).rejects.toThrow('Giessen Data sent older details.')
  })

  it('refuses another realm at the same address', async () => {
    const { signed } = await signedRealm()
    const other = await verifyDescriptor((await signedRealm()).signed)
    serve(signed)
    await expect(recheckRealm(other)).rejects.toThrow('Realm details do not match.')
  })
})
