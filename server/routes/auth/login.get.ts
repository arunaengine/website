import {withQuery} from 'ufo'
import crypto from 'crypto'
import {AuthQuery, IdpMetadata, errorToPOJO, fetchCachedOidcMetadata} from "~/server/utils/oidc";

export default defineEventHandler(async event => {
  const provider = getQuery(event)['provider']
  const add_idp = getQuery(event)['add_idp']

  if (!provider) {
    //panic!('No provider provided')
    throw new Error('No provider provided')
  }

  // Fetch provider specific config
  const providers = useRuntimeConfig().provider
  const config = providers[provider as keyof typeof providers]
  if (!config) {
    throw new Error(`Unknown/Unsupported identity provider: ${provider}`)
  }

  // Delete older cookie with login meta info
  deleteCookie(event, 'login_meta')

  // Fetch idp metadata from well-known url
  const response = await fetchCachedOidcMetadata(config.wellKnownUrl)
  if (Array.isArray(response)) {
    return createError({
      statusCode: response[0],
      message: `Login failed: '${response[1]}'. Please try again later or contact the website administrator`,
    });
  }
  console.log(`[Login Server] Idp meta fetch ${response}`)

  // Start authentication flow
  let auth_query: AuthQuery = {
    client_id: config.clientId,
    redirect_uri: config.redirectUrl,
    scope: config.scope.join(' '),
    response_type: 'code',
  }

  let code_verifier
  if (config?.code_challenge) {
    //const state = crypto.randomUUID() // Optional
    code_verifier = crypto.randomUUID()
    const code_challenge = crypto.createHash('sha256').update(code_verifier).digest().toString('base64url')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    // Add PKCE relevant fields
    auth_query['code_challenge_method'] = 'S256'
    auth_query['code_challenge'] = code_challenge
  }

  // Cache login meta information in cookie for callback
  setCookie(event, 'login_meta', JSON.stringify({
    provider: provider,
    code_verifier: code_verifier,
    add_idp: add_idp ? add_idp : false
  }))

  // Redirect to idp authorization endpoint
  return sendRedirect(
      event,
      withQuery(response.authorization_endpoint, auth_query)
  )
})