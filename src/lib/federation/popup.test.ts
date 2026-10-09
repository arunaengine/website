import { describe, expect, it } from 'vitest'
import { signedRealm } from '@/test/federation'
import { verifyDescriptor } from './descriptor'
import { HandshakeError } from './handshake'
import { acceptOpener, checkHandoff, popupFailure, popupUrl } from './popup'

const SERVING = 'https://data.giessen.example'

describe('acceptOpener', () => {
  it('accepts a verified descriptor from its own portal origin', async () => {
    const { signed } = await signedRealm()
    const accepted = await acceptOpener({ id: 1, origin: SERVING, body: { kind: 'login', descriptor: signed, nonce: 'n' } }, 'home')
    expect(accepted.realm.name).toBe('Giessen Data')
  })

  it('refuses a descriptor sent from another origin', async () => {
    const { signed } = await signedRealm()
    await expect(
      acceptOpener({ id: 1, origin: 'https://evil.example', body: { kind: 'login', descriptor: signed, nonce: 'n' } }, 'home'),
    ).rejects.toThrow('did not come from the realm')
  })

  it('refuses a descriptor that does not verify', async () => {
    const { signed } = await signedRealm()
    const forged = { ...signed, payload: { ...signed.payload, name: 'Other' } }
    await expect(
      acceptOpener({ id: 1, origin: SERVING, body: { kind: 'login', descriptor: forged, nonce: 'n' } }, 'home'),
    ).rejects.toThrow('do not verify')
  })

  it('refuses its own realm and unknown kinds', async () => {
    const { signed } = await signedRealm()
    const own = (await verifyDescriptor(signed)).realmId
    await expect(
      acceptOpener({ id: 1, origin: SERVING, body: { kind: 'login', descriptor: signed, nonce: 'n' } }, own),
    ).rejects.toThrow('same realm')
    await expect(acceptOpener({ id: 1, origin: SERVING, body: { kind: 'push', jobId: 'j' } }, 'home')).rejects.toThrow('not supported')
  })
})

describe('checkHandoff', () => {
  it('needs the home realm as issuer and user realm, and the attempt nonce', async () => {
    const { signed, raw } = await signedRealm()
    const home = await verifyDescriptor(signed)
    const handoff = (issuer: number[], userRealm: number[], nonce: string) => ({
      payload: {
        issuer,
        user: { user_ulid: '01J', realm_id: userRealm },
        audience: [],
        descriptor_digest: '',
        nonce,
        name: 'Anna',
        issued_at: 1,
        expires_at: 2,
        handoff_id: 'h',
      },
      signer: 'Realm' as const,
      signature: '',
    })
    const key = Array.from(raw)
    const other = Array(32).fill(7)
    expect(() => checkHandoff(handoff(key, key, 'abc'), home, 'abc')).not.toThrow()
    expect(() => checkHandoff(handoff(other, key, 'abc'), home, 'abc')).toThrow('another realm')
    expect(() => checkHandoff(handoff(key, other, 'abc'), home, 'abc')).toThrow('another realm')
    expect(() => checkHandoff(handoff(key, key, 'abd'), home, 'abc')).toThrow('this attempt')
  })
})

describe('popup helpers', () => {
  it('opens the popup page of the home portal', async () => {
    const realm = await verifyDescriptor((await signedRealm({ portal_url: 'https://data.giessen.example/portal/' })).signed)
    expect(popupUrl(realm)).toBe('https://data.giessen.example/federation/popup')
  })

  it('names how a popup flow ended', () => {
    expect(popupFailure(new HandshakeError('closed', 'x'), 'login')).toBe('Login cancelled.')
    expect(popupFailure(new HandshakeError('timeout', 'x'), 'import')).toBe('Import timed out.')
    expect(popupFailure(new Error('other'), 'login')).toBeNull()
  })
})
