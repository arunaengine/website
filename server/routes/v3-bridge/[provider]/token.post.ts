import {bridgeTarget, brokerRealm, fetchCachedOidcMetadata, portalCallback, portalCors, takeCode, verifierMatches} from "~/server/utils/oidc";

const TOKEN_FIELDS = ['grant_type', 'code', 'redirect_uri', 'code_verifier', 'client_id', 'client_secret']

function basicClientId(authorization: string | undefined): string[] {
  if (!authorization?.startsWith('Basic ')) return []
  const user = Buffer.from(authorization.slice(6), 'base64').toString().split(':')[0] ?? ''
  try {
    return [user, decodeURIComponent(user.replace(/\+/g, ' '))]
  } catch {
    return [user]
  }
}

type ProviderConfig = NonNullable<ReturnType<typeof bridgeTarget>>['config']

// Portal code exchange with the bridge's own client credentials; returns only the ID token
async function portalExchange(config: ProviderConfig, tokenEndpoint: string, form: URLSearchParams) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: form.get('code')!,
    redirect_uri: config.redirectUrl,
  })
  if (config.code_challenge) body.set('code_verifier', form.get('code_verifier')!)
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  }
  if (config.post_auth) {
    body.set('client_id', config.clientId)
    body.set('client_secret', config.clientSecret)
  } else {
    headers['Authorization'] = 'Basic ' + btoa(config.clientId + ':' + config.clientSecret)
  }
  const upstream = await fetch(tokenEndpoint, {method: 'POST', headers, body, redirect: 'manual'})
  const reply = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    const error = typeof reply.error === 'string' ? reply.error : 'server_error'
    return {status: upstream.status === 400 || upstream.status === 401 ? upstream.status : 502, body: {error}}
  }
  if (typeof reply.id_token !== 'string') {
    return {status: 502, body: {error: 'server_error', error_description: 'No ID token from provider'}}
  }
  const expires_in = typeof reply.expires_in === 'number' ? reply.expires_in : undefined
  return {status: 200, body: {id_token: reply.id_token, token_type: 'Bearer', expires_in}}
}

// v3 Keycloak or portal token URL: exchanges the code with the registered v2 redirect URI.
// Keycloak client authentication passes through unchanged; bodies and tokens are never logged.
export default defineEventHandler(async event => {
  portalCors(event)
  const provider = getRouterParam(event, 'provider') ?? ''
  if (!bridgeTarget(provider)) {
    throw createError({statusCode: 404, statusMessage: 'Not Found'})
  }
  const oauthError = (statusCode: number, error: string, error_description?: string) => {
    setResponseStatus(event, statusCode)
    return error_description ? {error, error_description} : {error}
  }

  const form = new URLSearchParams(await readRawBody(event) ?? '')
  const body = new URLSearchParams()
  for (const field of TOKEN_FIELDS) {
    const [value, ...more] = form.getAll(field)
    if (more.length) return oauthError(400, 'invalid_request')
    if (value !== undefined) body.set(field, value)
  }
  if (body.get('grant_type') !== 'authorization_code') return oauthError(400, 'unsupported_grant_type')
  if (!body.get('code')) return oauthError(400, 'invalid_request')
  const portal = portalCallback(body.get('redirect_uri'))
  const target = portal ? bridgeTarget(provider) : bridgeTarget(provider, brokerRealm(body.get('redirect_uri'), provider))
  if (!target || (!portal && body.get('redirect_uri') !== target.brokerUrl)) {
    return oauthError(400, 'invalid_request', 'Login bridge target not allowed')
  }
  if (portal) {
    if (body.get('client_id') !== target.config.clientId) return oauthError(401, 'invalid_client')
    if (!body.get('code_verifier')) return oauthError(400, 'invalid_request')
    // Bridge PKCE: the code must come from this bridge's callback, once, for this callback and verifier
    const pending = takeCode(body.get('code')!)
    if (!pending || pending.provider !== provider || pending.callback !== body.get('redirect_uri') ||
        !verifierMatches(body.get('code_verifier')!, pending.challenge)) {
      setResponseHeader(event, 'Cache-Control', 'no-store')
      return oauthError(400, 'invalid_grant')
    }
    const metadata = await fetchCachedOidcMetadata(target.config.wellKnownUrl)
    if (Array.isArray(metadata)) return oauthError(502, 'temporarily_unavailable')
    const result = await portalExchange(target.config, metadata.token_endpoint, body)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseStatus(event, result.status)
    return result.body
  }

  const authorization = getHeader(event, 'authorization')
  const basicIds = basicClientId(authorization)
  const bodyId = body.get('client_id')
  if ((!authorization && !bodyId) ||
      (authorization && !basicIds.includes(target.config.clientId)) ||
      (bodyId !== null && bodyId !== target.config.clientId)) {
    return oauthError(401, 'invalid_client')
  }
  body.set('redirect_uri', target.config.redirectUrl)

  const metadata = await fetchCachedOidcMetadata(target.config.wellKnownUrl)
  if (Array.isArray(metadata)) {
    return oauthError(502, 'temporarily_unavailable')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  }
  if (authorization) headers['Authorization'] = authorization
  const upstream = await fetch(metadata.token_endpoint, {method: 'POST', headers, body, redirect: 'manual'})
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  })
})
