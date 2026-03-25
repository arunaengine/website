import {v2GetUserResponse} from '~/composables/aruna_api_json'
import {ArunaError} from "~/composables/ArunaError";

export type IdpMeta = {
  tag: string,
  issuer: string,
}

export type IdpConfig = {
  wellKnownUrl: string,
  clientId: string,
  clientSecret: string,
  redirectUrl: string,
  scope: string[],
  code_challenge: boolean,
  post_auth: boolean
}

export default defineEventHandler(async event => {
  if (event.context.access_token === undefined) {
    // Not logged in
    console.log("[Idps Server] No access token.");
    return []
  }

  const token_claims = parseJwt(event.context.access_token)
  let idpMeta: IdpMeta[] = []
  for (const [key, value] of Object.entries(useRuntimeConfig().provider)) {
    console.log(key, value)
    if (!value.wellKnownUrl)
      continue

    const response = await fetchCachedOidcMetadata((value as IdpConfig).wellKnownUrl)
    if (Array.isArray(response)) {
      console.error(`Failed to fetch identity provider metadata for ${key}: ${value}`)
      continue
    }

    if (token_claims.iss === response.issuer)
      continue

    idpMeta.push({
      tag: key,
      issuer: response.issuer
    })
  }

  return idpMeta
})