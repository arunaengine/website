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
