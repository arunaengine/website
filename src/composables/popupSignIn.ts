// A second sign-in that leaves this session alone. The provider asks for a login again and the
// tokens stay in memory. The web opens a popup; the desktop opens its own sign-in window.
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  pkceChallengeS256,
  randomUrlSafeString,
  type OidcTokenResponse,
} from '@/lib/oidc'
import { POPUP_CHANNEL, POPUP_STATE_PREFIX } from '@/lib/popupHandoff'
import { beginAuthRedirect, callbackUri, oidcClient, opensOutside, signInState } from './useAuth'

/** Long enough to choose a login and sign in. */
const SIGN_IN_TIMEOUT_MS = 10 * 60_000

export class SignInCancelled extends Error {
  name = 'SignInCancelled'
}

interface Waiting {
  state: string
  resolve: (params: URLSearchParams) => void
  reject: (error: Error) => void
}

let waiting: Waiting | null = null

/** Hands a callback to the waiting sign-in; false when it belongs to none. */
export function receiveCallback(params: URLSearchParams): boolean {
  const current = waiting
  if (!current || params.get('state') !== current.state) return false
  waiting = null
  current.resolve(params)
  return true
}

/** Ends the waiting sign-in, such as when its window was closed. */
export function cancelPopup(): void {
  const current = waiting
  waiting = null
  current?.reject(new SignInCancelled('Sign-in cancelled.'))
}

function waitFor(state: string): Promise<URLSearchParams> {
  cancelPopup()
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(POPUP_CHANNEL)
  let timer: ReturnType<typeof setTimeout> | undefined
  return new Promise<URLSearchParams>((resolve, reject) => {
    waiting = { state, resolve, reject }
    timer = setTimeout(() => {
      if (waiting?.state !== state) return
      waiting = null
      reject(new SignInCancelled('Sign-in timed out.'))
    }, SIGN_IN_TIMEOUT_MS)
    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        const search = (event.data as { search?: unknown } | null)?.search
        if (typeof search === 'string') receiveCallback(new URLSearchParams(search))
      }
    }
  }).finally(() => {
    clearTimeout(timer)
    channel?.close()
  })
}

/**
 * Signs in once more and returns the provider's tokens. Call it in a click handler: the web
 * popup opens before the first await.
 */
export async function popupSignIn(): Promise<OidcTokenResponse> {
  const outside = opensOutside()
  const popup = outside ? null : window.open('about:blank', '_blank', 'popup,width=560,height=760')
  if (!outside && !popup) throw new Error('The browser blocked the sign-in window. Allow popups for this site.')
  try {
    const { clientId, discovery, send } = await oidcClient()
    const verifier = randomUrlSafeString(48)
    const state = signInState(POPUP_STATE_PREFIX)
    const redirectUri = callbackUri()
    const url = buildAuthorizationUrl({
      authorizationEndpoint: discovery.authorization_endpoint,
      clientId,
      redirectUri,
      state,
      codeChallenge: await pkceChallengeS256(verifier),
      freshLogin: true,
    })
    const answer = waitFor(state)
    if (popup) popup.location.replace(url)
    else beginAuthRedirect(url)
    const params = await answer
    const error = params.get('error')
    if (error) throw new Error(params.get('error_description') || `Sign-in was rejected (${error}).`)
    const code = params.get('code')
    if (!code) throw new Error('The identity provider did not return an authorization code.')
    return await exchangeAuthorizationCode({
      tokenEndpoint: discovery.token_endpoint,
      clientId,
      redirectUri,
      code,
      codeVerifier: verifier,
      send,
    })
  } finally {
    popup?.close()
  }
}
