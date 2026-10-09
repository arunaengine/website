// Linking a login of another realm to a local account here. The user first logs in here
// with the local account; then a fresh popup at the home realm returns a handoff bound to
// that local session, the node confirms both, and the user links after seeing both names.
import { ref } from 'vue'
import {
  ApiError,
  apiErrorMessage,
  createLink,
  createLinkConfirmation,
  deleteLink,
  type LinkConfirmation,
} from '@/lib/api'
import type { Signed, VerifiedRealm } from '@/lib/federation/descriptor'
import { popupFailure } from '@/lib/federation/popup'
import { linkNonce, newSecret, tokenSessionId } from '@/lib/federation/secret'
import { assertCurrentSession, refreshContext } from './aruna/state'
import { refresh } from './aruna/session'
import { requestHandoff } from './useFederation'

const PENDING_KEY = 'aruna.federation.link'

/** A link the user asked for before logging in here with the local account. */
export interface PendingLink {
  apiBaseUrl: string
  homeRealmId: string
}

function readPending(): PendingLink | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(PENDING_KEY) ?? 'null') as PendingLink | null
  } catch {
    return null
  }
}

export const pendingLink = ref<PendingLink | null>(typeof window === 'undefined' ? null : readPending())

export function setPendingLink(next: PendingLink | null) {
  pendingLink.value = next
  try {
    if (next) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(next))
    else window.sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // The pending link stays in memory for this page.
  }
}

/** Short words for a failed link step. */
export function linkFailure(error: unknown): string {
  const popup = popupFailure(error, 'link')
  if (popup) return popup
  if (error instanceof ApiError && error.code === 'link_conflict') {
    return 'This login is already linked to another account here.'
  }
  if (error instanceof ApiError && error.code === 'link_refused') {
    return 'Linking was refused. Log in here again, then try once more.'
  }
  if (error instanceof ApiError) return 'Linking failed. Try again.'
  return apiErrorMessage(error)
}

/**
 * Asks the home realm for a handoff bound to this local session and has this realm confirm
 * it. The confirmation names both accounts; nothing is linked yet.
 */
export async function confirmLink(
  home: VerifiedRealm,
): Promise<{ confirmation: Signed<LinkConfirmation>; name: string | null }> {
  const context = refreshContext()
  const sessionId = tokenSessionId(context.client.token ?? '')
  if (!sessionId) throw new Error('Log in here first.')
  const { secret } = await newSecret()
  const nonce = await linkNonce(sessionId, secret)
  const handoff = await requestHandoff(home, nonce, true)
  assertCurrentSession(context.epoch)
  const confirmation = await createLinkConfirmation(handoff, secret, context.client)
  assertCurrentSession(context.epoch)
  return { confirmation, name: handoff.payload.name }
}

export async function finishLink(confirmation: Signed<LinkConfirmation>) {
  const context = refreshContext()
  const linked = await createLink(confirmation, context.client)
  assertCurrentSession(context.epoch)
  setPendingLink(null)
  await refresh()
  return linked
}

export async function removeLogin(userId: string, login: string) {
  const context = refreshContext()
  await deleteLink(userId, login, context.client)
  assertCurrentSession(context.epoch)
  await refresh()
}
