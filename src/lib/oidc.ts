export interface OidcDiscoveryDocument {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  end_session_endpoint?: string
}

export interface OidcTokenResponse {
  access_token: string
  id_token?: string
  token_type: string
  expires_in?: number
}

const discoveryCache = new Map<string, Promise<OidcDiscoveryDocument>>()
const OIDC_TIMEOUT_MS = 15_000

export function fetchDiscovery(discoveryUrl: string): Promise<OidcDiscoveryDocument> {
  let cached = discoveryCache.get(discoveryUrl)
  if (!cached) {
    cached = fetchWithTimeout(discoveryUrl, {}, OIDC_TIMEOUT_MS).then(async (response) => {
      if (!response.ok) {
        throw new Error(`OIDC discovery failed: ${response.status} ${response.statusText}`)
      }
      return (await response.json()) as OidcDiscoveryDocument
    })
    cached.catch(() => discoveryCache.delete(discoveryUrl))
    discoveryCache.set(discoveryUrl, cached)
  }
  return cached
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomUrlSafeString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

export async function pkceChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

export function buildAuthorizationUrl(input: {
  authorizationEndpoint: string
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scope?: string
}): string {
  const url = new URL(input.authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', input.scope ?? 'openid profile email')
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function exchangeAuthorizationCode(input: {
  tokenEndpoint: string
  clientId: string
  redirectUri: string
  code: string
  codeVerifier: string
}): Promise<OidcTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  })
  const response = await fetchWithTimeout(
    input.tokenEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    OIDC_TIMEOUT_MS,
  )
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const json = await response.json()
      detail = json.error_description || json.error || detail
    } catch {
      // Keep the HTTP status detail if the body is not JSON.
    }
    throw new Error(`Token exchange failed: ${detail}`)
  }
  return (await response.json()) as OidcTokenResponse
}

// A redirect target is optional: a provider refuses one it has not registered,
// and a caller with nowhere to come back to must still be able to log out.
export function buildEndSessionUrl(input: {
  endSessionEndpoint: string
  idTokenHint?: string
  postLogoutRedirectUri?: string
  clientId: string
}): string {
  const url = new URL(input.endSessionEndpoint)
  if (input.idTokenHint) url.searchParams.set('id_token_hint', input.idTokenHint)
  if (input.postLogoutRedirectUri) {
    url.searchParams.set('post_logout_redirect_uri', input.postLogoutRedirectUri)
  }
  url.searchParams.set('client_id', input.clientId)
  return url.toString()
}
import { fetchWithTimeout } from './fetch'
