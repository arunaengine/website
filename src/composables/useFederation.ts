// The serving realm's side of a federated login: the popup at the home realm returns a
// signed handoff, and this realm turns it into a session of its own. Every result is bound
// to the API base and session it started with.
import { ref } from 'vue'
import {
  ApiError,
  apiErrorMessage,
  createFederatedSession,
  getRealmDescriptor,
  type LoginHandoff,
} from '@/lib/api'
import type { VerifiedRealm, Signed } from '@/lib/federation/descriptor'
import type { PopupChannel } from '@/lib/federation/handshake'
import { checkHandoff, openPopup, popupFailure, showRealm } from '@/lib/federation/popup'
import { rememberRealm, knownRealm, recheckRealm } from '@/lib/federation/realms'
import { newSecret } from '@/lib/federation/secret'
import { shortId } from './aruna/format'
import { apiBaseUrl, assertCurrentSession, authToken, readStored, refreshContext, storeValue } from './aruna/state'
import { refresh, setAuthToken } from './aruna/session'

const LOGIN_KEY = 'aruna.federation.login'

/** The last federated login in this browser, for the link offer after it. */
export interface FederatedLogin {
  apiBaseUrl: string
  homeRealmId: string
  homeName: string
  linked: boolean
  accountHint: boolean
  dismissed: boolean
}

function readLogin(): FederatedLogin | null {
  try {
    const stored = JSON.parse(readStored(LOGIN_KEY) || 'null') as FederatedLogin | null
    return stored && stored.apiBaseUrl === apiBaseUrl.value ? stored : null
  } catch {
    return null
  }
}

export const federatedLogin = ref<FederatedLogin | null>(readLogin())

function storeLogin(next: FederatedLogin | null) {
  federatedLogin.value = next
  storeValue(LOGIN_KEY, next ? JSON.stringify(next) : '')
}

export function dismissLinkOffer() {
  if (federatedLogin.value) storeLogin({ ...federatedLogin.value, dismissed: true })
}

/** A realm's name for a full user id `ulid@realm`, when the user is not of this realm. */
export function homeRealmLabel(userId: string, ownRealmId: string): string | null {
  const realmId = userId.split('@')[1] ?? ''
  if (!realmId || realmId === ownRealmId) return null
  return knownRealm(realmId)?.name ?? `Realm ${shortId(realmId)}`
}

export class FederationError extends Error {
  name = 'FederationError'
}

/**
 * Checks the home realm again, sends the empty popup `channel` there and returns its handoff
 * for this realm, bound to `nonce`. The popup closes in any case. `link` only changes the
 * words the home realm shows.
 */
export async function requestHandoff(
  channel: PopupChannel,
  home: VerifiedRealm,
  nonce: string,
  link = false,
): Promise<Signed<LoginHandoff>> {
  const context = refreshContext()
  try {
    let descriptor
    let checked: VerifiedRealm
    try {
      ;[descriptor, checked] = await Promise.all([getRealmDescriptor(context.client), recheckRealm(home)])
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new FederationError('This realm does not take logins from other realms.')
      }
      throw error
    }
    assertCurrentSession(context.epoch)
    showRealm(channel, checked)
    const handoff = await channel.ask<Signed<LoginHandoff>>({ kind: 'login', descriptor, nonce, link })
    assertCurrentSession(context.epoch)
    checkHandoff(handoff, checked, nonce)
    return handoff
  } finally {
    channel.close()
  }
}

function sessionFailure(error: unknown, home: VerifiedRealm, servingName: string): string {
  if (error instanceof ApiError && error.code === 'federation_disabled') {
    return `${servingName} does not take logins from other realms.`
  }
  if (error instanceof ApiError && error.code === 'handoff_rejected' && /not accepted/i.test(error.message)) {
    return `${servingName} does not allow logins from ${home.name}.`
  }
  return popupFailure(error, 'login') ?? apiErrorMessage(error)
}

/**
 * Logs in here with an account of `home`; returns an error message or null on success. Call
 * it in the click handler: the popup opens before the first await.
 */
export async function loginWithRealm(home: VerifiedRealm, servingName: string): Promise<string | null> {
  const startedFor = apiBaseUrl.value
  const startToken = authToken.value
  let channel: PopupChannel | null = null
  try {
    channel = openPopup(window)
    const { secret, nonce } = await newSecret()
    const handoff = await requestHandoff(channel, home, nonce)
    const session = await createFederatedSession(handoff, secret, { baseUrl: startedFor })
    if (apiBaseUrl.value !== startedFor || authToken.value !== startToken) {
      throw new FederationError('The session changed during the login.')
    }
    rememberRealm(home)
    setAuthToken(session.token)
    storeLogin({
      apiBaseUrl: startedFor,
      homeRealmId: home.realmId,
      homeName: home.name,
      linked: session.linked,
      accountHint: session.account_hint,
      dismissed: session.linked,
    })
    await refresh()
    return null
  } catch (error) {
    return sessionFailure(error, home, servingName)
  } finally {
    channel?.close()
  }
}
