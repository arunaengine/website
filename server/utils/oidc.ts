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

// True only for exactly https://<subdomain>.aruna-engine.org/auth/callback
export function portalCallback(redirectUri: unknown) {
  if (typeof redirectUri !== 'string') return false
  try {
    const origin = new URL(redirectUri).origin
    return portalOrigin(origin) && redirectUri === `${origin}/auth/callback`
  } catch {
    return false
  }
}

// State sent upstream for a portal login: provider, portal callback (base64url) and portal state
export function portalState(provider: string, callback: string, state: string) {
  return `v3p.${provider}.${Buffer.from(callback).toString('base64url')}.${state}`
}

// Checked portal callback and portal state of a wrapped portal state, else undefined
export function portalReturn(state: string) {
  const [, provider = '', encoded = '', portal = ''] = /^v3p\.([^.]+)\.([\w-]+)\.(.+)$/s.exec(state) ?? []
  const callback = Buffer.from(encoded, 'base64url').toString()
  return portal && portalCallback(callback) && bridgeTarget(provider) ? {callback, state: portal} : undefined
}
