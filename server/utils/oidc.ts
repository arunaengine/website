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
