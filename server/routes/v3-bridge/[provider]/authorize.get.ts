import {withQuery} from 'ufo'
import {bridgeTarget, fetchCachedOidcMetadata} from "~/server/utils/oidc";

// v3 Keycloak authorization URL: sends the user to the provider with the registered v2 redirect URI
export default defineEventHandler(async event => {
  const provider = getRouterParam(event, 'provider') ?? ''
  const target = bridgeTarget(provider)
  if (!target) {
    throw createError({statusCode: 404, statusMessage: 'Not Found'})
  }

  const query = getQuery(event)
  const {client_id, redirect_uri, response_type, state} = query
  if (Object.values(query).some(value => typeof value !== 'string') ||
      client_id !== target.config.clientId ||
      redirect_uri !== target.brokerUrl ||
      response_type !== 'code' ||
      !state) {
    throw createError({statusCode: 400, statusMessage: 'Invalid authorization request'})
  }

  const metadata = await fetchCachedOidcMetadata(target.config.wellKnownUrl)
  if (Array.isArray(metadata)) {
    throw createError({statusCode: 502, statusMessage: 'Identity provider unavailable'})
  }

  return sendRedirect(event, withQuery(metadata.authorization_endpoint, {
    ...query,
    redirect_uri: target.config.redirectUrl,
    state: `v3.${provider}.${state}`,
  }))
})
