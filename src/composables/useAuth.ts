import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { apiRequest } from '@/lib/api'
import type { RealmInfoResponse } from '@/lib/api'
import {
  buildAuthorizationUrl,
  buildEndSessionUrl,
  exchangeAuthorizationCode,
  fetchDiscovery,
  pkceChallengeS256,
  randomUrlSafeString,
} from '@/lib/oidc'

const VERIFIER_KEY = 'aruna.oidc.verifier'
const STATE_KEY = 'aruna.oidc.state'
const REDIRECT_KEY = 'aruna.oidc.redirect'
const ONBOARDING_KEY = 'aruna.oidc.onboardingSecret'
const ID_TOKEN_KEY = 'aruna.oidc.idToken'

export type SignInStage = 'idle' | 'redirecting' | 'exchanging' | 'registering' | 'done' | 'error'

const stage = ref<SignInStage>('idle')
const stageError = ref<string | null>(null)

interface RegisterUserResponse {
  id: string
  name: string
}

interface GetTokenResponse {
  token: string
}

function callbackUri(): string {
  return `${window.location.origin}/auth/callback`
}

async function resolveProvider() {
  const { realmInfo, apiBaseUrl } = useAruna()
  let info = realmInfo.value
  if (!info) {
    info = await apiRequest<RealmInfoResponse>('/info/realm', {}, { baseUrl: apiBaseUrl.value })
  }
  const provider = info.oidc_providers[0]
  if (!provider) {
    throw new Error('The realm has no OIDC provider configured — sign-in is not available.')
  }
  // The realm announces the audience its tokens must carry; for the Keycloak
  // public client this doubles as the client id (same convention as aruna-doctor).
  return { clientId: provider.audience, discoveryUrl: provider.discovery_url }
}

/** Redirects the browser to the realm's Keycloak login page (code + PKCE). */
async function signIn(options: { onboardingSecret?: string; redirectTo?: string } = {}) {
  stage.value = 'redirecting'
  stageError.value = null
  try {
    const { clientId, discoveryUrl } = await resolveProvider()
    const discovery = await fetchDiscovery(discoveryUrl)
    const verifier = randomUrlSafeString(48)
    const state = randomUrlSafeString(16)
    window.sessionStorage.removeItem(ID_TOKEN_KEY)
    window.sessionStorage.setItem(VERIFIER_KEY, verifier)
    window.sessionStorage.setItem(STATE_KEY, state)
    window.sessionStorage.setItem(REDIRECT_KEY, options.redirectTo ?? '/app')
    if (options.onboardingSecret?.trim()) {
      window.sessionStorage.setItem(ONBOARDING_KEY, options.onboardingSecret.trim())
    } else {
      window.sessionStorage.removeItem(ONBOARDING_KEY)
    }
    window.location.assign(
      buildAuthorizationUrl({
        authorizationEndpoint: discovery.authorization_endpoint,
        clientId,
        redirectUri: callbackUri(),
        state,
        codeChallenge: await pkceChallengeS256(verifier),
      }),
    )
  } catch (err) {
    stage.value = 'error'
    stageError.value = err instanceof Error ? err.message : String(err)
  }
}

/**
 * Completes the flow on /auth/callback: code → Keycloak ID token →
 * register-or-get the Aruna user → exchange for a long-lived Aruna API token.
 * Returns the route to continue to.
 */
async function completeSignIn(params: URLSearchParams): Promise<string> {
  const aruna = useAruna()
  stageError.value = null
  let consumeTransaction = false
  let appliedArunaToken = false
  try {
    const state = params.get('state')
    const expectedState = window.sessionStorage.getItem(STATE_KEY)
    if (!expectedState) throw new Error('This sign-in attempt was not started here — please try again.')
    if (state !== expectedState) throw new Error('State mismatch — please try signing in again.')
    consumeTransaction = true

    const oidcError = params.get('error')
    if (oidcError) {
      throw new Error(params.get('error_description') || `Sign-in was rejected (${oidcError}).`)
    }
    const code = params.get('code')
    const verifier = window.sessionStorage.getItem(VERIFIER_KEY)
    if (!code) throw new Error('The identity provider did not return an authorization code.')
    if (!verifier) {
      throw new Error('This sign-in attempt was not started here — please try again.')
    }

    stage.value = 'exchanging'
    const { clientId, discoveryUrl } = await resolveProvider()
    const discovery = await fetchDiscovery(discoveryUrl)
    const tokens = await exchangeAuthorizationCode({
      tokenEndpoint: discovery.token_endpoint,
      clientId,
      redirectUri: callbackUri(),
      code,
      codeVerifier: verifier,
    })
    // Aruna validates the audience against the client id, which Keycloak only
    // sets on the ID token — the access token is for the account API.
    const oidcToken = tokens.id_token ?? tokens.access_token
    if (tokens.id_token) window.sessionStorage.setItem(ID_TOKEN_KEY, tokens.id_token)

    stage.value = 'registering'
    const client = { baseUrl: aruna.apiBaseUrl.value, token: oidcToken }
    const onboardingSecret = window.sessionStorage.getItem(ONBOARDING_KEY)
    await apiRequest<RegisterUserResponse>(
      '/users/register',
      {
        method: 'POST',
        body: JSON.stringify(onboardingSecret ? { onboarding_secret: onboardingSecret } : {}),
      },
      client,
    )
    const issued = await apiRequest<GetTokenResponse>('/users/token', {}, client)
    aruna.setAuthToken(issued.token)
    appliedArunaToken = true
    await aruna.refresh()
    if (!aruna.currentUser.value) {
      throw new Error(aruna.authError.value || 'The issued session could not be validated by this Aruna node.')
    }

    stage.value = 'done'
    const redirectTo = window.sessionStorage.getItem(REDIRECT_KEY) || '/app'
    return redirectTo
  } catch (err) {
    if (appliedArunaToken) aruna.setAuthToken('')
    window.sessionStorage.removeItem(ID_TOKEN_KEY)
    stage.value = 'error'
    stageError.value = err instanceof Error ? err.message : String(err)
    throw err
  } finally {
    if (consumeTransaction) {
      window.sessionStorage.removeItem(VERIFIER_KEY)
      window.sessionStorage.removeItem(STATE_KEY)
      window.sessionStorage.removeItem(REDIRECT_KEY)
      window.sessionStorage.removeItem(ONBOARDING_KEY)
    }
  }
}

/**
 * Clears the Aruna session; when the sign-in came through Keycloak the browser
 * is also sent through the end-session endpoint so the SSO session ends.
 */
async function signOut() {
  const aruna = useAruna()
  aruna.setAuthToken('')
  const idToken = window.sessionStorage.getItem(ID_TOKEN_KEY)
  window.sessionStorage.removeItem(ID_TOKEN_KEY)
  stage.value = 'idle'
  stageError.value = null
  if (idToken) {
    try {
      const { clientId, discoveryUrl } = await resolveProvider()
      const discovery = await fetchDiscovery(discoveryUrl)
      if (discovery.end_session_endpoint) {
        window.location.assign(
          buildEndSessionUrl({
            endSessionEndpoint: discovery.end_session_endpoint,
            idTokenHint: idToken,
            postLogoutRedirectUri: window.location.origin,
            clientId,
          }),
        )
        return
      }
    } catch {
      // Keycloak unreachable — the local session is already cleared.
    }
  }
  await aruna.refresh()
}

export function useAuth() {
  const aruna = useAruna()
  return {
    stage,
    stageError,
    signIn,
    completeSignIn,
    signOut,
    /** A bearer token is configured (session may still be loading or invalid). */
    hasSession: computed(() => Boolean(aruna.authToken.value)),
    /** The token was accepted and the user profile is loaded. */
    isAuthenticated: computed(() => Boolean(aruna.currentUser.value)),
  }
}
