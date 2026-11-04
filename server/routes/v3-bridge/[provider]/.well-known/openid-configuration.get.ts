import {bridgeTarget} from "~/server/utils/oidc";

// Endpoints of the bridge for native apps: Aruna Desktop posts only to a token endpoint
// that a fetched discovery document named. ID tokens still come from the upstream issuer.
export default defineEventHandler(event => {
  const provider = getRouterParam(event, 'provider') ?? ''
  const target = bridgeTarget(provider)
  if (!target) {
    throw createError({statusCode: 404, statusMessage: 'Not Found'})
  }
  const base = `${new URL(target.config.redirectUrl).origin}/v3-bridge/${provider}`
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
  }
})
