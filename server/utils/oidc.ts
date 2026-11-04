import type {H3Event} from "h3";
import {createHash, timingSafeEqual} from "node:crypto";

export type IdpMetadata = {
  issuer: string,
  authorization_endpoint: string,
  token_endpoint: string,
  revocation_endpoint: string,
  introspection_endpoint: string,
  userinfo_endpoint: string,
  jwks_uri: string
}

export type AuthQuery = {
  response_type: 'code',
  client_id: string,
  redirect_uri: string,
  scope: string,
  state: string,
  code_challenge_method?: 'S256',
  code_challenge?: string
}

export function errorToPOJO(error: any) {
  const ret: any = {};
  for (const propertyName of Object.getOwnPropertyNames(error)) {
    ret[propertyName] = error[propertyName];
  }
  return ret;
}

export const fetchCachedOidcMetadata = defineCachedFunction(async (wellKnowUrl: string): Promise<IdpMetadata | [number, string]> => {
  return await $fetch<IdpMetadata>(wellKnowUrl)
      .catch(error => {
        console.error(error)
        return [error.code, error.data.error_description]
      })
}, {
  group: 'idp-configs',
  name: 'idp-metadata',
  maxAge: useRuntimeConfig().cacheMaxAge || 60 * 60, // Defaults to 1 hour
  swr: false,
  getKey: (identityProvider: string) => identityProvider,
})

// True only for an https Keycloak realm URL on aruna-engine.org or one of its subdomains
export function allowedRealm(realmUrl: string) {
  let url: URL
  try {
    url = new URL(realmUrl)
  } catch {
    return false
  }
  const host = url.hostname
  return url.protocol === 'https:' && url.href === realmUrl && !url.port && !url.username &&
    (host === 'aruna-engine.org' || host.endsWith('.aruna-engine.org')) &&
    /^\/realms\/[\w.-]+$/.test(url.pathname)
}

// Realm URL of a Keycloak broker endpoint URL for the provider, else undefined
export function brokerRealm(redirectUri: unknown, provider: string) {
  const suffix = `/broker/${provider}/endpoint`
  return typeof redirectUri === 'string' && redirectUri.endsWith(suffix)
    ? redirectUri.slice(0, -suffix.length)
    : undefined
}

// Provider config and v3 Keycloak broker URL of a bridged provider, else undefined.
// The realm defaults to the configured one; any other realm must pass allowedRealm.
export function bridgeTarget(provider: string, realmUrl?: string) {
  const {realmUrl: defaultRealm, providers: bridged} = useRuntimeConfig().v3Bridge
  const providers = useRuntimeConfig().provider
  if (!defaultRealm || !bridged.split(',').includes(provider) || !Object.hasOwn(providers, provider)) {
    return undefined
  }
  const config = providers[provider as keyof typeof providers]
  if (!config.clientId) {
    return undefined
  }
  const fallback = defaultRealm.replace(/\/+$/, '')
  const realm = realmUrl ?? fallback
  if (realm !== fallback && !allowedRealm(realm)) {
    return undefined
  }
  return {config, realm, isDefault: realm === fallback, brokerUrl: `${realm}/broker/${provider}/endpoint`}
}

const PORTAL_ORIGIN = /^https:\/\/([a-z0-9-]+\.)+aruna-engine\.org$/

// True only for an https origin on a subdomain of aruna-engine.org, without port or userinfo
export function portalOrigin(origin: unknown) {
  return typeof origin === 'string' && PORTAL_ORIGIN.test(origin)
}

// The callback Aruna Desktop registers for its own scheme
export const DESKTOP_CALLBACK = 'aruna://auth/callback'

// True for an RFC 8252 loopback callback http://127.0.0.1:<port>/auth/callback or
// http://[::1]:<port>/auth/callback (any port), or exactly the desktop scheme callback
export function nativeCallback(redirectUri: unknown) {
  if (redirectUri === DESKTOP_CALLBACK) return true
  if (typeof redirectUri !== 'string') return false
  try {
    const url = new URL(redirectUri)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]') &&
      redirectUri === `${url.origin}/auth/callback`
  } catch {
    return false
  }
}

// True for exactly https://<subdomain>.aruna-engine.org/auth/callback or a native app callback
export function portalCallback(redirectUri: unknown) {
  if (nativeCallback(redirectUri)) return true
  if (typeof redirectUri !== 'string') return false
  try {
    const origin = new URL(redirectUri).origin
    return portalOrigin(origin) && redirectUri === `${origin}/auth/callback`
  } catch {
    return false
  }
}

// True for an S256 code challenge: the base64url SHA-256 digest, 43 characters
export function s256Challenge(challenge: unknown) {
  return typeof challenge === 'string' && /^[\w-]{43}$/.test(challenge)
}

// State sent upstream for a portal login: provider, portal callback (base64url), code challenge and portal state
export function portalState(provider: string, callback: string, challenge: string, state: string) {
  return `v3p.${provider}.${Buffer.from(callback).toString('base64url')}.${challenge}.${state}`
}

// Checked portal callback, code challenge and portal state of a wrapped portal state, else undefined
export function portalReturn(state: string) {
  const [, provider = '', encoded = '', challenge = '', portal = ''] =
    /^v3p\.([^.]+)\.([\w-]+)\.([\w-]+)\.(.+)$/s.exec(state) ?? []
  const callback = Buffer.from(encoded, 'base64url').toString()
  return portal && portalCallback(callback) && s256Challenge(challenge) && bridgeTarget(provider)
    ? {provider, callback, challenge, state: portal}
    : undefined
}

type PendingCode = {provider: string, callback: string, challenge: string, expires: number}

// Codes sent back to a portal or app, each bound to its code challenge and callback.
// In memory, single use, five minutes; a restart drops pending sign-ins.
const pendingCodes = new Map<string, PendingCode>()
const PENDING_MS = 5 * 60 * 1000

export function rememberCode(code: string, entry: Omit<PendingCode, 'expires'>) {
  const now = Date.now()
  for (const [key, pending] of pendingCodes) {
    if (pending.expires <= now) pendingCodes.delete(key)
  }
  pendingCodes.set(code, {...entry, expires: now + PENDING_MS})
}

// The pending entry of a code, removed on first use; undefined when unknown, used or expired
export function takeCode(code: string) {
  const pending = pendingCodes.get(code)
  pendingCodes.delete(code)
  return pending && pending.expires > Date.now() ? pending : undefined
}

// True when the verifier's S256 digest equals the challenge (RFC 7636)
export function verifierMatches(verifier: string, challenge: string) {
  if (!/^[\w.~-]{43,128}$/.test(verifier)) return false
  const digest = createHash('sha256').update(verifier).digest()
  const expected = Buffer.from(challenge, 'base64url')
  return expected.length === digest.length && timingSafeEqual(digest, expected)
}

// CORS for the portal token request: echoes only portal origins, never with credentials
export function portalCors(event: H3Event) {
  const origin = getRequestHeader(event, 'origin')
  setResponseHeader(event, 'Vary', 'Origin')
  if (portalOrigin(origin)) {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
  }
}
