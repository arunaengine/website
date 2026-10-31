import {bridgeTarget, fetchCachedOidcMetadata} from "~/server/utils/oidc";

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

// v3 Keycloak token URL: forwards the code exchange with the registered v2 redirect URI.
// Client authentication passes through unchanged; bodies and tokens are never logged.
export default defineEventHandler(async event => {
  const target = bridgeTarget(getRouterParam(event, 'provider') ?? '')
  if (!target) {
    throw createError({statusCode: 404, statusMessage: 'Not Found'})
  }
  const oauthError = (statusCode: number, error: string) => {
    setResponseStatus(event, statusCode)
    return {error}
  }

  const form = new URLSearchParams(await readRawBody(event) ?? '')
  const body = new URLSearchParams()
  for (const field of TOKEN_FIELDS) {
    const [value, ...more] = form.getAll(field)
    if (more.length) return oauthError(400, 'invalid_request')
    if (value !== undefined) body.set(field, value)
  }
  if (body.get('grant_type') !== 'authorization_code') return oauthError(400, 'unsupported_grant_type')
  if (!body.get('code') || body.get('redirect_uri') !== target.brokerUrl) return oauthError(400, 'invalid_request')

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
