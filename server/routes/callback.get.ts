import type {v2AddOidcProviderResponse} from "~/composables/aruna_api_json";
import {withQuery} from 'ufo'
import {bridgeTarget, errorToPOJO, fetchCachedOidcMetadata, portalReturn} from "~/server/utils/oidc";

type AuthCodeRequest = {
  grant_type: 'authorization_code',
  redirect_uri: string,
  code: string,
  code_verifier?: string, // Only with PKCE
  client_id?: string,     // Only with client_secret_post (config.post_auth: true)
  client_secret?: string, // Only with client_secret_post (config.post_auth: true)
}

type AuthCodeResponse = {
  access_token: string,
  refresh_token: string,
  expires_in: number | undefined,
  refresh_expires_in: number | undefined,
}

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const {code, state} = query

  // v3 login bridge: forward the response to the checked portal callback or v3 Keycloak broker URL, no v2 login
  if (typeof state === 'string' && (state.startsWith('v3.') || state.startsWith('v3p.'))) {
    let target: string | undefined
    let bridgedState: string | undefined
    if (state.startsWith('v3p.')) {
      const portal = portalReturn(state)
      target = portal?.callback
      bridgedState = portal?.state
    } else {
      const [, alias = '', realm, keycloakState] =
        /^v3\.([^.@]+)(?:@([\w-]+))?\.(.+)$/s.exec(state) ?? []
      const realmUrl = realm === undefined ? undefined : Buffer.from(realm, 'base64url').toString()
      target = bridgeTarget(alias, realmUrl)?.brokerUrl
      bridgedState = keycloakState
    }
    if (!bridgedState || !target) {
      throw createError({statusCode: 400, statusMessage: 'Invalid login bridge request'})
    }
    const forward: Record<string, string> = {state: bridgedState}
    for (const key of ['code', 'error', 'error_description', 'iss']) {
      if (typeof query[key] === 'string') forward[key] = query[key] as string
    }
    return sendRedirect(event, withQuery(target, forward))
  }

  if (!code) {
    return createError({
      statusCode: 400,
      message: 'Missing authorization code',
    });
  }

  // Fetch login meta info cookie and remove it
  const login_meta = getCookie(event, 'login_meta')
  deleteCookie(event, 'login_meta')

  if (!login_meta)
    throw new Error('Missing login meta information')
  const {provider, code_verifier, add_idp, state: expected_state} = JSON.parse(login_meta)
  if (!state || state !== expected_state) {
    return createError({
      statusCode: 400,
      message: 'Login failed: invalid state. Please try again.',
    });
  }

  // Fetch provider specific config
  const providers = useRuntimeConfig().provider
  const config = providers[provider as keyof typeof providers]
  if (!config) {
    throw new Error(`Unknown/Unsupported identity provider: ${provider}`)
  }

  const response = await fetchCachedOidcMetadata(config.wellKnownUrl)
  if (Array.isArray(response)) {
    return createError({
      statusCode: response[0],
      message: `Failed to fetch openid configuration of identity provider: '${response[1]}'. 
      Please try again later or contact the website administrator`,
    });
  }

  // Build request and fetch access/refresh token from provider
  let request: AuthCodeRequest = {
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUrl,
    code: code as string,
  }
  if (code_verifier) {
    request.code_verifier = code_verifier
  }
  if (config.post_auth) {
    request.client_id = config.clientId
    request.client_secret = config.clientSecret
  }
  let headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (!config.post_auth) {
    headers['Authorization'] = 'Basic ' + btoa(config.clientId + ":" + config.clientSecret)
  }

  let tokens = await $fetch<AuthCodeResponse>(response.token_endpoint, {
    method: 'POST',
    headers: headers,
    body: new URLSearchParams(request).toString(),
  }).catch(error => {
    console.debug(errorToPOJO(error))
    return [error.code, error.data.error_description]
  })

  if (Array.isArray(tokens)) {
    return createError({
      statusCode: tokens[0],
      message: `Login failed: '${tokens[1]}'. Please try again later or contact the website administrator`,
    });
  }

  if (add_idp) {
    // Fetch current access token
    const access_token = getCookie(event, 'access_token')

    //Send request to add idp provider to user in Aruna
    const success = await $fetch<v2AddOidcProviderResponse>('/api/user/oidc', {
      method: 'PATCH',
      body: {
        accessToken: access_token,
        newAccessToken: tokens.access_token
      }
    }).then(response => {
      return 'success'
    }).catch(error => {
      console.error(error)
      return 'failure'
    })

    return sendRedirect(event, `/user/account?add=${success}`)
  }

  // Set cookies with tokens
  setCookie(event, 'access_token', tokens.access_token,
      {
        httpOnly: false,
        secure: true,
        sameSite: 'none',
        maxAge: tokens.expires_in,
      }
  )
  setCookie(event, 'refresh_token', tokens.refresh_token,
      {
        httpOnly: false,
        secure: true,
        sameSite: 'none',
        maxAge: tokens.refresh_expires_in,
      }
  )

  return sendRedirect(event, "/") // "/user/dashboard"
})