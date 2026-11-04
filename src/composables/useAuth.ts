import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { restoring } from '@/composables/aruna/state'
import { tokenClaims } from '@/composables/aruna/renewal'
import { ApiError, apiRequest, issueToken, signInHasNoAccount } from '@/lib/api'
import type { RealmInfoResponse } from '@/lib/api'
import { featureEnabled, portalConfig, type LoginOption, type UpstreamLogin } from '@/lib/config'
import { desktopBridge } from '@/lib/desktop'
import { DESKTOP_CALLBACK_URI, DESKTOP_STATE_PREFIX } from '@/lib/desktopHandoff'
import {
  buildAuthorizationUrl,
  buildEndSessionUrl,
  exchangeAuthorizationCode,
  fetchDiscovery,
  pkceChallengeS256,
  randomUrlSafeString,
  type OidcDiscoveryDocument,
} from '@/lib/oidc'
import { errorMessage } from '@/lib/utils'
import { signInChoice } from '@/composables/signInChoice'

const VERIFIER_KEY = 'aruna.oidc.verifier'
const STATE_KEY = 'aruna.oidc.state'
const REDIRECT_KEY = 'aruna.oidc.redirect'
const ONBOARDING_KEY = 'aruna.oidc.onboardingSecret'
const ID_TOKEN_KEY = 'aruna.oidc.idToken'
const LINK_KEY = 'aruna.oidc.link'
const UPSTREAM_KEY = 'aruna.oidc.upstream'

export type SignInStage = 'idle' | 'redirecting' | 'exchanging' | 'registering' | 'match' | 'done' | 'error'

const stage = ref<SignInStage>('idle')
const stageError = ref<string | null>(null)

export interface SignInOptions {
  onboardingSecret?: string
  redirectTo?: string
  freshLogin?: boolean
  /** Extra authorization request parameters of the chosen login option. */
  params?: Record<string, string>
  /** The upstream provider of the chosen login option, signed in through its bridge. */
  upstream?: UpstreamLogin
}

/** The outcome of linking another login, shown once back in Settings. */
export interface ProviderLink {
  name: string
  linked: boolean
  message?: string
}

const providerLink = ref<ProviderLink | null>(null)

/** A new sign-in whose email or name matches an account; its token stays in memory. */
export interface AccountMatch {
  oidcToken: string
  /** Stored once a session for the new sign-in is adopted, to end it at the provider. */
  idToken?: string
  redirectTo: string
}

export const accountMatch = ref<AccountMatch | null>(null)

interface RegisterUserResponse {
  id: string
  name: string
}

interface GetTokenResponse {
  token: string
}

/** Native shells hand the authorization URL to the system browser (RFC 8252). */
export type AuthOpener = (url: string) => void

let authOpener: AuthOpener | null = null

/** Installs the system-browser opener; null restores in-page navigation. */
export function setAuthOpener(opener: AuthOpener | null): void {
  authOpener = opener
}

/** The registered OIDC redirect_uri; a configured origin wins over the page. */
export function callbackUri(): string {
  const origin = portalConfig().authCallbackOrigin
  if (origin) return `${origin}/auth/callback`
  return featureEnabled('desktop') ? DESKTOP_CALLBACK_URI : `${window.location.origin}/auth/callback`
}

// A desktop sign-in that returns through a website carries the mark; nothing
// secret goes into the state, the verifier stays in this window.
export function signInState(mark = ''): string {
  const state = mark + randomUrlSafeString(16)
  if (!featureEnabled('desktop')) return state
  const { protocol } = new URL(callbackUri())
  return protocol === 'https:' || protocol === 'http:' ? `${DESKTOP_STATE_PREFIX}${state}` : state
}

/**
 * Sends the user to the identity provider. A desktop shell takes the URL
 * through the injected opener, into the system browser or a window of its
 * own, so the login never runs inside this webview.
 */
export function beginAuthRedirect(url: string): void {
  if (opensOutside()) {
    authOpener!(url)
    return
  }
  window.location.assign(url)
}

/** True when a desktop shell opens sign-ins outside this window. */
export function opensOutside(): boolean {
  return (featureEnabled('systemBrowserAuth') || featureEnabled('embeddedAuth')) && authOpener !== null
}

/** Drops a sign-in the provider never answered, such as a closed login window. */
export function cancelSignIn(): void {
  if (stage.value !== 'redirecting') return
  stage.value = 'idle'
  stageError.value = null
}

// From tauri://localhost a strict provider allows no CORS, so a shell with
// the commands runs discovery and the token request natively.
const NATIVE_OIDC_BRIDGE = 8

async function nativeOidc() {
  const bridge = desktopBridge()
  return bridge && bridge.version >= NATIVE_OIDC_BRIDGE ? import('@/lib/desktopBridge') : null
}

async function discover(url: string): Promise<OidcDiscoveryDocument> {
  const native = await nativeOidc()
  return native ? native.oidcDiscovery(url) : fetchDiscovery(url)
}

async function resolveProvider(upstream?: UpstreamLogin | null) {
  const { realmInfo, apiBaseUrl } = useAruna()
  let info = realmInfo.value
  if (!info) {
    info = await apiRequest<RealmInfoResponse>('/system/realm', {}, { baseUrl: apiBaseUrl.value })
  }
  const provider = upstream ? info.oidc_providers.find((entry) => entry.id === upstream.provider) : info.oidc_providers[0]
  if (!provider && upstream) throw new Error(`The realm has no OIDC provider "${upstream.provider}", sign-in is not available.`)
  if (!provider) {
    throw new Error('The realm has no OIDC provider configured, sign-in is not available.')
  }
  // The realm announces the audience its tokens must carry; for the Keycloak
  // public client this doubles as the client id (same convention as aruna-doctor).
  return { clientId: provider.audience, discoveryUrl: provider.discovery_url, issuer: provider.issuer }
}

/** The realm's OIDC client, the provider's endpoints and the shell's token sender. */
export async function oidcClient() {
  const { clientId, discoveryUrl } = await resolveProvider()
  return { clientId, discovery: await discover(discoveryUrl), send: (await nativeOidc())?.oidcToken }
}

// An upstream login uses its bridge's endpoints, any other the realm provider's discovery.
// A desktop shell posts only to a token endpoint a discovery named, so it reads the bridge's.
async function endpoints(upstream: UpstreamLogin | null) {
  const { clientId, discoveryUrl } = await resolveProvider(upstream)
  if (upstream) {
    const native = await nativeOidc()
    const token = native
      ? (await native.oidcDiscovery(`${upstream.bridge}/.well-known/openid-configuration`)).token_endpoint
      : `${upstream.bridge}/token`
    return { clientId, authorization: `${upstream.bridge}/authorize`, token }
  }
  const discovery = await discover(discoveryUrl)
  return { clientId, authorization: discovery.authorization_endpoint, token: discovery.token_endpoint }
}

// The upstream login the pending sign-in started with; null for any other.
function pendingUpstream(): UpstreamLogin | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(UPSTREAM_KEY) ?? 'null') as Partial<UpstreamLogin> | null
    return typeof stored?.provider === 'string' && typeof stored.bridge === 'string' ? { provider: stored.provider, bridge: stored.bridge } : null
  } catch {
    return null
  }
}

/** Redirects the browser to the realm's Keycloak login page (code + PKCE). */
async function signIn(options: SignInOptions = {}) {
  return authorize(options)
}

// `link` names a login whose params link it, such as Keycloak's idp_link action.
// The Aruna session and its ID token stay as they are.
async function authorize(options: SignInOptions & { link?: string }) {
  stage.value = 'redirecting'
  stageError.value = null
  try {
    const upstream = options.upstream ?? null
    const { clientId, authorization } = await endpoints(upstream)
    const verifier = randomUrlSafeString(48)
    const state = signInState()
    if (options.link) window.sessionStorage.setItem(LINK_KEY, options.link)
    else {
      window.sessionStorage.removeItem(LINK_KEY)
      window.sessionStorage.removeItem(ID_TOKEN_KEY)
    }
    window.sessionStorage.setItem(VERIFIER_KEY, verifier)
    if (upstream) window.sessionStorage.setItem(UPSTREAM_KEY, JSON.stringify(upstream))
    else window.sessionStorage.removeItem(UPSTREAM_KEY)
    window.sessionStorage.setItem(STATE_KEY, state)
    window.sessionStorage.setItem(REDIRECT_KEY, options.redirectTo ?? '/app')
    if (options.onboardingSecret?.trim()) {
      window.sessionStorage.setItem(ONBOARDING_KEY, options.onboardingSecret.trim())
    } else {
      window.sessionStorage.removeItem(ONBOARDING_KEY)
    }
    beginAuthRedirect(
      buildAuthorizationUrl({
        authorizationEndpoint: authorization,
        clientId,
        redirectUri: callbackUri(),
        state,
        codeChallenge: await pkceChallengeS256(verifier),
        freshLogin: options.freshLogin,
        params: options.params,
      }),
    )
  } catch (err) {
    stage.value = 'error'
    stageError.value = errorMessage(err)
  }
}

/** Links another login to the signed-in account, then returns to `redirectTo`. */
async function linkProvider(option: LoginOption, redirectTo = '/app/settings') {
  providerLink.value = null
  return authorize({ redirectTo, link: option.name, params: option.linkParams })
}

/** Opens the login chooser, which always offers logins with another Aruna realm. */
async function requestSignIn(options: SignInOptions = {}) {
  signInChoice.value = options
}

// Keycloak returns from an action with `kc_action_status` and a code; the session is untouched.
async function finishLink(params: URLSearchParams, name: string): Promise<string> {
  const status = params.get('kc_action_status')
  if (status === 'success') providerLink.value = await confirmLink(params, name)
  else if (status === 'cancelled') providerLink.value = null
  else {
    const reason = params.get('error_description') ?? params.get('error')
    providerLink.value = { name, linked: false, message: reason ?? undefined }
  }
  stage.value = 'idle'
  return window.sessionStorage.getItem(REDIRECT_KEY) || '/app/settings'
}

// Keycloak links to the user of its own browser session, which may not be the signed-in one, so
// the linked identity's Aruna account must be the account of the active token. Another session or
// realm meanwhile ends the confirmation quietly with null.
async function confirmLink(params: URLSearchParams, name: string): Promise<ProviderLink | null> {
  const { authToken, apiBaseUrl, sessionEpoch } = useAruna()
  const own = tokenClaims(authToken.value ?? '')?.sub
  const baseUrl = apiBaseUrl.value
  const epoch = sessionEpoch.value
  const code = params.get('code')
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY)
  const tokens = own && code && verifier ? await redeemCode(code, verifier).catch(() => null) : null
  const account = tokens?.id_token ? await accountOf(tokens.id_token, baseUrl) : undefined
  if (epoch !== sessionEpoch.value || baseUrl !== apiBaseUrl.value) return null
  if (own && account === own) return { name, linked: true }
  const message = account !== undefined
    ? 'The identity provider is signed in as another account and linked it there. Sign out of the identity provider, then link again.'
    : 'It could not be confirmed for this account. Check the linked logins in your account.'
  return { name, linked: false, message }
}

// The Aruna account of an identity: its user id, null when it has none, undefined when unknown.
// The node names it in a helper token that is never adopted and ends before the answer returns.
async function accountOf(idToken: string, baseUrl: string): Promise<string | null | undefined> {
  let token: string | undefined
  try {
    token = await issueToken(idToken, baseUrl)
    return tokenClaims(token)?.sub
  } catch (error) {
    return signInHasNoAccount(error) ? null : undefined
  } finally {
    if (token) await revokeHelper(token, baseUrl)
  }
}

// Ends the helper session, trying once more on failure; a session left open is logged without its token.
async function revokeHelper(token: string, baseUrl: string) {
  const sid = tokenClaims(token)?.sid
  const revoke = () => apiRequest<void>(`/access/sessions/${encodeURIComponent(sid ?? '')}`, { method: 'DELETE' }, { baseUrl, token })
  try {
    if (!sid) throw new Error('The helper token names no session.')
    await revoke().catch(revoke)
  } catch (error) {
    // Only the status: a node's error text may echo the bearer.
    const status = error instanceof ApiError ? error.status : null
    console.warn('aruna-auth: helper session not revoked', { baseUrl, session: sid ?? null, status })
  }
}

async function redeemCode(code: string, verifier: string) {
  const { clientId, token } = await endpoints(pendingUpstream())
  return exchangeAuthorizationCode({
    tokenEndpoint: token,
    clientId,
    redirectUri: callbackUri(),
    code,
    codeVerifier: verifier,
    send: (await nativeOidc())?.oidcToken,
  })
}

/**
 * Opens a session with a realm token, whose account must load; `idToken` ends it at the provider.
 * A session that starts meanwhile is left alone, and this one ends with an AbortError.
 */
export async function adoptSession(token: string, idToken?: string): Promise<void> {
  const aruna = useAruna()
  aruna.setAuthToken(token)
  const epoch = aruna.sessionEpoch.value
  const ours = () => epoch === aruna.sessionEpoch.value
  try {
    await aruna.refresh()
    if (!ours()) throw new DOMException('Another session started meanwhile.', 'AbortError')
    if (!aruna.currentUser.value) {
      throw new Error(aruna.authError.value || 'The issued session could not be validated by this Aruna node.')
    }
  } catch (err) {
    if (ours()) aruna.setAuthToken('')
    throw err
  }
  if (idToken) window.sessionStorage.setItem(ID_TOKEN_KEY, idToken)
}

/**
 * Completes the flow on /auth/callback: code → Keycloak ID token →
 * register-or-get the Aruna user → exchange for a long-lived Aruna API token.
 * Returns the route to continue to, or null when the sign-in matches an account.
 */
async function completeSignIn(params: URLSearchParams): Promise<string | null> {
  const aruna = useAruna()
  stageError.value = null
  accountMatch.value = null
  let consumeTransaction = false
  try {
    const state = params.get('state')
    const expectedState = window.sessionStorage.getItem(STATE_KEY)
    if (!expectedState) throw new Error('This sign-in attempt was not started here, please try again.')
    if (state !== expectedState) throw new Error('State mismatch, please try signing in again.')
    consumeTransaction = true
    const linking = window.sessionStorage.getItem(LINK_KEY)
    if (linking) return await finishLink(params, linking)

    const oidcError = params.get('error')
    if (oidcError) {
      throw new Error(params.get('error_description') || `Sign-in was rejected (${oidcError}).`)
    }
    const code = params.get('code')
    const verifier = window.sessionStorage.getItem(VERIFIER_KEY)
    if (!code) throw new Error('The identity provider did not return an authorization code.')
    if (!verifier) {
      throw new Error('This sign-in attempt was not started here, please try again.')
    }

    stage.value = 'exchanging'
    const tokens = await redeemCode(code, verifier)
    // Aruna validates the audience against the client id, which Keycloak only
    // sets on the ID token; the access token is for the account API.
    const oidcToken = tokens.id_token ?? tokens.access_token
    // An upstream login has no Keycloak session to end at sign-out.
    const endSession = pendingUpstream() ? undefined : tokens.id_token

    stage.value = 'registering'
    const client = { baseUrl: aruna.apiBaseUrl.value, token: oidcToken }
    const onboardingSecret = window.sessionStorage.getItem(ONBOARDING_KEY)
    try {
      await apiRequest<RegisterUserResponse>(
        '/access/users/register',
        {
          method: 'POST',
          body: JSON.stringify(onboardingSecret ? { onboarding_secret: onboardingSecret } : {}),
        },
        client,
      )
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'account_match')) throw err
      accountMatch.value = { oidcToken, idToken: endSession, redirectTo: window.sessionStorage.getItem(REDIRECT_KEY) || '/app' }
      stage.value = 'match'
      return null
    }
    const issued = await apiRequest<GetTokenResponse>('/access/token', {}, client)
    await adoptSession(issued.token, endSession)

    stage.value = 'done'
    const redirectTo = window.sessionStorage.getItem(REDIRECT_KEY) || '/app'
    return redirectTo
  } catch (err) {
    stage.value = 'error'
    stageError.value = errorMessage(err)
    throw err
  } finally {
    if (consumeTransaction) {
      window.sessionStorage.removeItem(VERIFIER_KEY)
      window.sessionStorage.removeItem(STATE_KEY)
      window.sessionStorage.removeItem(REDIRECT_KEY)
      window.sessionStorage.removeItem(ONBOARDING_KEY)
      window.sessionStorage.removeItem(LINK_KEY)
      window.sessionStorage.removeItem(UPSTREAM_KEY)
    }
  }
}

// Best effort: a refused or lost revoke still signs out here, and the session then expires.
// `keepalive` lets the request finish while the tab moves on to the provider.
function revokeCurrent(token: string, baseUrl: string) {
  const sid = token ? tokenClaims(token)?.sid : undefined
  if (!sid) return
  const path = `/access/sessions/${encodeURIComponent(sid)}`
  void apiRequest<void>(path, { method: 'DELETE', keepalive: true }, { baseUrl, token }).catch(() => undefined)
}

/**
 * Clears the Aruna session; when the sign-in came through Keycloak the browser
 * is also sent through the end-session endpoint so the SSO session ends.
 */
async function signOut() {
  const aruna = useAruna()
  revokeCurrent(aruna.authToken.value, aruna.apiBaseUrl.value)
  aruna.setAuthToken('')
  const idToken = window.sessionStorage.getItem(ID_TOKEN_KEY)
  window.sessionStorage.removeItem(ID_TOKEN_KEY)
  stage.value = 'idle'
  stageError.value = null
  if (idToken) {
    try {
      const { clientId, discoveryUrl } = await resolveProvider()
      const discovery = await discover(discoveryUrl)
      if (discovery.end_session_endpoint) {
        // The shell ends the SSO session in the system browser, so its own
        // window stays on the app instead of navigating to the provider. Its
        // origin is not a registered redirect target, and naming one the
        // provider refuses would leave the session standing, so it names none.
        const inShell = featureEnabled('desktop')
        beginAuthRedirect(
          buildEndSessionUrl({
            endSessionEndpoint: discovery.end_session_endpoint,
            idTokenHint: idToken,
            postLogoutRedirectUri: inShell ? undefined : window.location.origin,
            clientId,
          }),
        )
        if (!inShell) return
      }
    } catch {
      // Keycloak unreachable: the local session is already cleared.
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
    requestSignIn,
    linkProvider,
    providerLink,
    cancelSignIn,
    completeSignIn,
    signOut,
    /** A bearer token is configured (session may still be loading or invalid). */
    hasSession: computed(() => Boolean(aruna.authToken.value)),
    /** The token was accepted and the user profile is loaded. */
    isAuthenticated: computed(() => Boolean(aruna.currentUser.value)),
    /**
     * A stored token exists but the initial refresh has not resolved yet: the
     * user is probably signed in, so render a loading state instead of the
     * signed-out branch (no stored session = never pending, signed-out content
     * shows immediately).
     */
    authPending: computed(() => (Boolean(aruna.authToken.value) || restoring.value) && !aruna.bootstrapped.value),
  }
}
