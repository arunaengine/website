// Signed realm descriptors: the browser checks every descriptor itself before it trusts a
// realm's name or addresses. The signature covers the postcard encoding the node signs
// (aruna core/src/federation.rs), so the bytes are rebuilt here field by field.
import { fromBase64Url } from '@/lib/vault/hpke'
import { fetchWithTimeout } from '@/lib/fetch'

export const DESCRIPTOR_DOMAIN = 'aruna-realm-descriptor-v1'
const MAX_NAME_LENGTH = 128
const FETCH_TIMEOUT_MS = 10_000

/** A realm id as the node writes it in JSON: the 32 key bytes, or their base64url text. */
export type RealmIdValue = number[] | string

export interface RealmDescriptor {
  realm_id: RealmIdValue
  name: string
  description: string
  api_url: string
  portal_url: string
  issued_at: number
}

export type Signer = 'Realm' | { Delegated: { issuer_pubkey: string; delegation_signature: string } }

export interface Signed<T> {
  payload: T
  signer: Signer
  /** Hex ed25519 signature. */
  signature: string
}

/** A descriptor this browser checked, with the values the portal uses. */
export interface VerifiedRealm {
  realmId: string
  name: string
  description: string
  apiUrl: string
  portalUrl: string
  portalOrigin: string
  issuedAt: number
  descriptor: Signed<RealmDescriptor>
}

export class DescriptorError extends Error {
  constructor(
    public reason: 'invalid' | 'unreachable' | 'mismatch',
    message: string,
  ) {
    super(message)
    this.name = 'DescriptorError'
  }
}

const encoder = new TextEncoder()

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})*$/i.test(text)) return null
  const bytes = new Uint8Array(text.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(text.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

/** The 32 key bytes of a realm id in either JSON form, or null when malformed. */
export function realmIdBytes(value: RealmIdValue): Uint8Array<ArrayBuffer> | null {
  try {
    const bytes = typeof value === 'string' ? fromBase64Url(value) : Uint8Array.from(value)
    if (bytes.length !== 32) return null
    if (Array.isArray(value) && value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null
    return bytes
  } catch {
    return null
  }
}

/** The base64url text form of a realm id, as `/system/realm` and user ids show it. */
export function realmIdText(value: RealmIdValue): string {
  const bytes = realmIdBytes(value)
  return bytes ? toBase64Url(bytes) : ''
}

/** A full user id `ulid@realm` from the JSON object form the node writes in signed payloads. */
export function userIdText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const user = value as { user_ulid?: unknown; realm_id?: RealmIdValue }
  if (typeof user.user_ulid !== 'string' || !user.realm_id) return ''
  return `${user.user_ulid}@${realmIdText(user.realm_id)}`
}

function varint(value: number): number[] {
  const out: number[] = []
  let rest = value
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80)
    rest = Math.floor(rest / 0x80)
  }
  out.push(rest)
  return out
}

function postcardString(value: string): number[] {
  const bytes = encoder.encode(value)
  return [...varint(bytes.length), ...bytes]
}

/** The bytes a descriptor signature covers: postcard of `(domain, descriptor)`. */
export function descriptorSigningBytes(descriptor: RealmDescriptor): Uint8Array<ArrayBuffer> {
  const realm = realmIdBytes(descriptor.realm_id)
  if (!realm) throw new DescriptorError('invalid', 'The realm id is malformed.')
  return Uint8Array.from([
    ...postcardString(DESCRIPTOR_DOMAIN),
    ...realm,
    ...postcardString(descriptor.name),
    ...postcardString(descriptor.description),
    ...postcardString(descriptor.api_url),
    ...postcardString(descriptor.portal_url),
    ...varint(descriptor.issued_at),
  ])
}

async function verifyEd25519(key: Uint8Array<ArrayBuffer>, signature: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  try {
    const handle = await crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, handle, signature, data)
  } catch {
    return false
  }
}

/** HTTPS, or plain HTTP to a loopback host, as the node accepts for federation URLs. */
export function validFederationUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return Boolean(url.hostname)
  if (url.protocol !== 'http:') return false
  return url.hostname === 'localhost' || /^127\./.test(url.hostname) || url.hostname === '[::1]'
}

/** Checks the signature by the realm key or a key the realm delegated, and the public values. */
export async function verifyDescriptor(signed: Signed<RealmDescriptor>): Promise<VerifiedRealm> {
  const payload = signed?.payload
  if (!payload || typeof payload.name !== 'string' || !Number.isSafeInteger(payload.issued_at)) {
    throw new DescriptorError('invalid', 'The realm details are malformed.')
  }
  const realmKey = realmIdBytes(payload.realm_id)
  const signature = fromHex(signed.signature ?? '')
  if (!realmKey || !signature || signature.length !== 64) {
    throw new DescriptorError('invalid', 'The realm details are malformed.')
  }
  if (!payload.name.trim() || [...payload.name].length > MAX_NAME_LENGTH) {
    throw new DescriptorError('invalid', 'The realm name is invalid.')
  }
  if (!validFederationUrl(payload.api_url) || !validFederationUrl(payload.portal_url)) {
    throw new DescriptorError('invalid', 'The realm addresses must use HTTPS.')
  }
  let key = realmKey
  if (signed.signer !== 'Realm') {
    const delegated = typeof signed.signer === 'object' ? signed.signer?.Delegated : undefined
    const delegation = fromHex(delegated?.delegation_signature ?? '')
    let issuer: Uint8Array<ArrayBuffer> | null = null
    try {
      issuer = delegated ? fromBase64Url(delegated.issuer_pubkey) : null
    } catch {
      issuer = null
    }
    const valid =
      delegated && delegation && issuer?.length === 32 &&
      (await verifyEd25519(realmKey, delegation, encoder.encode(delegated.issuer_pubkey)))
    if (!valid || !issuer) throw new DescriptorError('invalid', 'The realm signature is not valid.')
    key = issuer
  }
  if (!(await verifyEd25519(key, signature, descriptorSigningBytes(payload)))) {
    throw new DescriptorError('invalid', 'The realm signature is not valid.')
  }
  return {
    realmId: toBase64Url(realmKey),
    name: payload.name,
    description: payload.description ?? '',
    apiUrl: payload.api_url,
    portalUrl: payload.portal_url,
    portalOrigin: new URL(payload.portal_url).origin,
    issuedAt: payload.issued_at,
    descriptor: signed,
  }
}

function sameDescriptor(left: Signed<RealmDescriptor>, right: Signed<RealmDescriptor>): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function fetchSigned(url: URL): Promise<Signed<RealmDescriptor>> {
  let response: Response
  try {
    response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, FETCH_TIMEOUT_MS)
  } catch {
    throw new DescriptorError('unreachable', `Cannot reach ${url.host}.`)
  }
  if (!response.ok) throw new DescriptorError('unreachable', `Cannot reach ${url.host}.`)
  try {
    return (await response.json()) as Signed<RealmDescriptor>
  } catch {
    throw new DescriptorError('invalid', 'The realm details are malformed.')
  }
}

export function descriptorRoute(apiUrl: string): URL {
  return new URL('system/realm/descriptor', apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`)
}

export function wellKnownRoute(portalUrl: string): URL {
  return new URL('/.well-known/aruna-realm', portalUrl)
}

/**
 * Loads a realm from its portal address: the portal route and the API route must both
 * return the same valid descriptor, and the address must be the realm's own portal.
 */
export async function loadRealm(address: string): Promise<VerifiedRealm> {
  let portal: URL
  try {
    portal = new URL(/^[a-z]+:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`)
  } catch {
    throw new DescriptorError('invalid', 'This is not a web address.')
  }
  const fromPortal = await verifyDescriptor(await fetchSigned(wellKnownRoute(portal.href)))
  if (fromPortal.portalOrigin !== portal.origin) {
    throw new DescriptorError('mismatch', 'Realm details do not match.')
  }
  const fromApi = await fetchSigned(descriptorRoute(fromPortal.apiUrl))
  if (!sameDescriptor(fromApi, fromPortal.descriptor)) {
    throw new DescriptorError('mismatch', 'Realm details do not match.')
  }
  return fromPortal
}
