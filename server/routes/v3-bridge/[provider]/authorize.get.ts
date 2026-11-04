import {withQuery} from 'ufo'
import {bridgeTarget, brokerRealm, fetchCachedOidcMetadata, portalCallback, portalState} from "~/server/utils/oidc";

// v3 Keycloak or portal authorization URL: sends the user to the provider with the registered v2 redirect URI
export default defineEventHandler(async event => {
  const provider = getRouterParam(event, 'provider') ?? ''
  if (!bridgeTarget(provider)) {
    throw createError({statusCode: 404, statusMessage: 'Not Found'})
  }

  const query = getQuery(event)
  const {client_id, redirect_uri, response_type, state} = query
  const portal = portalCallback(redirect_uri)
  const target = portal ? bridgeTarget(provider) : bridgeTarget(provider, brokerRealm(redirect_uri, provider))
  if (!target || (!portal && redirect_uri !== target.brokerUrl)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Login bridge target not allowed: only Keycloak realms and portals on aruna-engine.org',
    })
  }
  if (Object.values(query).some(value => typeof value !== 'string') ||
      client_id !== target.config.clientId ||
      response_type !== 'code' ||
      !state ||
      (portal && (query.code_challenge_method !== 'S256' || !query.code_challenge))) {
    throw createError({statusCode: 400, statusMessage: 'Invalid authorization request'})
  }
  const realmPart = target.isDefault ? '' : `@${Buffer.from(target.realm).toString('base64url')}`
  const upstream: Record<string, string> = {
    ...query as Record<string, string>,
    redirect_uri: target.config.redirectUrl,
    state: portal ? portalState(provider, redirect_uri as string, state as string) : `v3.${provider}${realmPart}.${state}`,
  }
  // Portal logins ask upstream for the v2 scope and send PKCE only where the v2 login does
  if (portal) {
    upstream.scope = target.config.scope.join(' ')
    if (!target.config.code_challenge) {
      delete upstream.code_challenge
      delete upstream.code_challenge_method
    }
  }

  const metadata = await fetchCachedOidcMetadata(target.config.wellKnownUrl)
  if (Array.isArray(metadata)) {
    throw createError({statusCode: 502, statusMessage: 'Identity provider unavailable'})
  }

  return sendRedirect(event, withQuery(metadata.authorization_endpoint, upstream))
})
