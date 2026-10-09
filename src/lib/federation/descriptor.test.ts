import { afterEach, describe, expect, it, vi } from 'vitest'
import { keyPair, sign, signedRealm } from '@/test/federation'
import {
  DESCRIPTOR_DOMAIN,
  descriptorSigningBytes,
  loadRealm,
  realmIdText,
  toBase64Url,
  toHex,
  userIdText,
  verifyDescriptor,
  type RealmDescriptor,
  type Signed,
} from './descriptor'

describe('descriptor signing bytes', () => {
  it('follow the postcard layout', () => {
    const payload: RealmDescriptor = {
      realm_id: Array.from({ length: 32 }, (_, index) => index),
      name: 'R',
      description: '',
      api_url: 'https://a/',
      portal_url: 'https://p/',
      issued_at: 300,
    }
    const bytes = Array.from(descriptorSigningBytes(payload))
    const domain = Array.from(new TextEncoder().encode(DESCRIPTOR_DOMAIN))
    expect(bytes.slice(0, 1 + domain.length)).toEqual([domain.length, ...domain])
    const rest = bytes.slice(1 + domain.length)
    expect(rest.slice(0, 32)).toEqual(payload.realm_id)
    expect(rest.slice(32, 34)).toEqual([1, 'R'.charCodeAt(0)])
    expect(rest[34]).toBe(0)
    // 300 is the varint 0xac 0x02.
    expect(rest.slice(-2)).toEqual([0xac, 0x02])
  })
})

describe('verifyDescriptor', () => {
  it('accepts a realm key signature', async () => {
    const { signed, raw } = await signedRealm()
    const realm = await verifyDescriptor(signed)
    expect(realm.realmId).toBe(toBase64Url(raw))
    expect(realm.portalOrigin).toBe('https://data.giessen.example')
  })

  it('accepts a delegated issuer key', async () => {
    const { signed, pair } = await signedRealm()
    const issuer = await keyPair()
    const issuerText = toBase64Url(issuer.raw)
    const delegated: Signed<RealmDescriptor> = {
      payload: signed.payload,
      signer: {
        Delegated: {
          issuer_pubkey: issuerText,
          delegation_signature: await sign(pair.privateKey, new TextEncoder().encode(issuerText)),
        },
      },
      signature: await sign(issuer.pair.privateKey, descriptorSigningBytes(signed.payload)),
    }
    await expect(verifyDescriptor(delegated)).resolves.toMatchObject({ name: 'Giessen Data' })
  })

  it('rejects a key the realm did not delegate', async () => {
    const { signed } = await signedRealm()
    const other = await keyPair()
    const issuerText = toBase64Url(other.raw)
    const forged: Signed<RealmDescriptor> = {
      payload: signed.payload,
      signer: {
        Delegated: {
          issuer_pubkey: issuerText,
          delegation_signature: await sign(other.pair.privateKey, new TextEncoder().encode(issuerText)),
        },
      },
      signature: await sign(other.pair.privateKey, descriptorSigningBytes(signed.payload)),
    }
    await expect(verifyDescriptor(forged)).rejects.toThrow('signature')
  })

  it('rejects a changed portal address', async () => {
    const { signed } = await signedRealm()
    const tampered = { ...signed, payload: { ...signed.payload, portal_url: 'https://evil.example/' } }
    await expect(verifyDescriptor(tampered)).rejects.toThrow('signature')
  })

  it('rejects plain HTTP outside loopback', async () => {
    const { signed } = await signedRealm({ portal_url: 'http://data.giessen.example/' })
    await expect(verifyDescriptor(signed)).rejects.toThrow('HTTPS')
  })
})

describe('id text', () => {
  it('turns byte arrays into the base64url form', () => {
    const bytes = Array.from({ length: 32 }, () => 255)
    expect(realmIdText(bytes)).toBe('_'.repeat(42) + '8')
    expect(userIdText({ user_ulid: '01J', realm_id: bytes })).toBe(`01J@${'_'.repeat(42)}8`)
    expect(realmIdText([1, 2])).toBe('')
  })
})

describe('loadRealm', () => {
  afterEach(() => vi.unstubAllGlobals())

  function serve(routes: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const body = routes[String(input)]
      return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 })
    }))
  }

  it('needs the same descriptor from both routes', async () => {
    const { signed } = await signedRealm()
    serve({
      'https://data.giessen.example/.well-known/aruna-realm': signed,
      'https://api.giessen.example/api/v1/system/realm/descriptor': signed,
    })
    await expect(loadRealm('data.giessen.example')).resolves.toMatchObject({ name: 'Giessen Data' })
  })

  it('reports a mismatch between the routes', async () => {
    const { signed } = await signedRealm()
    const older = await signedRealm()
    serve({
      'https://data.giessen.example/.well-known/aruna-realm': signed,
      'https://api.giessen.example/api/v1/system/realm/descriptor': older.signed,
    })
    await expect(loadRealm('https://data.giessen.example')).rejects.toMatchObject({ reason: 'mismatch' })
  })

  it('refuses a descriptor of another portal', async () => {
    const { signed } = await signedRealm()
    serve({ 'https://copy.example/.well-known/aruna-realm': signed })
    await expect(loadRealm('https://copy.example')).rejects.toMatchObject({ reason: 'mismatch' })
  })

  it('reports an unreachable realm', async () => {
    serve({})
    await expect(loadRealm('https://gone.example')).rejects.toMatchObject({ reason: 'unreachable' })
  })
})
