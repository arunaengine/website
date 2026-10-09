import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signedRealm } from '@/test/federation'
import { verifyDescriptor } from './descriptor'
import { knownRealm, listRegistry, rememberRealm, reloadRealms, savedRealms, setRealmSaved } from './realms'

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
