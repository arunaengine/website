// Signed realm fixtures made with throwaway Ed25519 keys.
import { descriptorSigningBytes, toHex, type RealmDescriptor, type Signed } from '@/lib/federation/descriptor'

export async function keyPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { pair, raw }
}

export async function sign(key: CryptoKey, data: Uint8Array<ArrayBuffer>) {
  return toHex(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, data)))
}

export async function signedRealm(overrides: Partial<RealmDescriptor> = {}) {
  const { pair, raw } = await keyPair()
  const payload: RealmDescriptor = {
    realm_id: Array.from(raw),
    name: 'Giessen Data',
    description: 'Field data',
    api_url: 'https://api.giessen.example/api/v1',
    portal_url: 'https://data.giessen.example/',
    issued_at: 1_791_000_000,
    ...overrides,
  }
  const signed: Signed<RealmDescriptor> = {
    payload,
    signer: 'Realm',
    signature: await sign(pair.privateKey, descriptorSigningBytes(payload)),
  }
  return { signed, pair, raw }
}
