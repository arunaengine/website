// Requests a realm portal sends to the popup page of the user's home realm, and the checks
// both sides make before they use one.
import type { ImportIntent, LoginHandoff } from '@/lib/api/federation'
import { realmIdText, userIdText, verifyDescriptor, type RealmDescriptor, type Signed, type VerifiedRealm } from './descriptor'
import { HandshakeError, PopupChannel, type HandshakeWindow, type OpenerRequest } from './handshake'

/** Long enough to log in at the home realm in another tab first. */
export const POPUP_TIMEOUT_MS = 10 * 60_000

export type PopupRequest =
  | { kind: 'login'; descriptor: Signed<RealmDescriptor>; nonce: string; link?: boolean }
  | { kind: 'export'; descriptor: Signed<RealmDescriptor>; intent: Signed<ImportIntent> }
  | { kind: 'push'; jobId: string }
  | { kind: 'done' }

/** The popup page of a realm's portal; it sends the opener policy that keeps the link. */
export function popupUrl(realm: VerifiedRealm): string {
  return new URL('/federation/popup', realm.portalUrl).href
}

export function openPopup(host: HandshakeWindow, realm: VerifiedRealm): PopupChannel {
  return new PopupChannel(host, popupUrl(realm), realm.portalOrigin, POPUP_TIMEOUT_MS)
}

export class RequestError extends Error {
  name = 'RequestError'
}

/**
 * The first request in a popup: its descriptor must verify, name another realm than this
 * one, and its portal origin must be where the message came from.
 */
export async function acceptOpener(request: OpenerRequest, ownRealmId: string): Promise<{ realm: VerifiedRealm; body: PopupRequest }> {
  const body = request.body as PopupRequest | undefined
  if (!body || (body.kind !== 'login' && body.kind !== 'export')) {
    throw new RequestError('This request is not supported.')
  }
  let realm: VerifiedRealm
  try {
    realm = await verifyDescriptor(body.descriptor)
  } catch {
    throw new RequestError('The other realm sent details that do not verify.')
  }
  if (realm.portalOrigin !== request.origin) {
    throw new RequestError('This request did not come from the realm it names.')
  }
  if (realm.realmId === ownRealmId) throw new RequestError('This is the same realm.')
  return { realm, body }
}

/** The opener's check of a handoff before it sends the secret along with it. */
export function checkHandoff(handoff: Signed<LoginHandoff>, home: VerifiedRealm, nonce: string) {
  const payload = handoff?.payload
  const user = userIdText(payload?.user)
  if (!payload || realmIdText(payload.issuer) !== home.realmId || !user.endsWith(`@${home.realmId}`)) {
    throw new RequestError(`${home.name} sent a login for another realm.`)
  }
  if (payload.nonce?.toLowerCase() !== nonce) throw new RequestError('The login does not belong to this attempt.')
}

/** Short words for a failed popup flow, per the reason it ended. */
export function popupFailure(error: unknown, kind: 'login' | 'import' | 'link'): string | null {
  if (!(error instanceof HandshakeError)) return null
  const word = kind === 'import' ? 'Import' : kind === 'link' ? 'Linking' : 'Login'
  if (error.reason === 'blocked') return error.message
  if (error.reason === 'timeout') return `${word} timed out.`
  if (error.reason === 'closed') return `${word} cancelled.`
  return error.message
}
