import type {v2AddOidcProviderResponse} from "~/composables/aruna_api_json";

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const {code, state} = query

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
  const {provider, code_verifier, add_idp} = JSON.parse(login_meta)

  // Fetch provider specific config
  const providers = useRuntimeConfig().provider
  const config = providers[provider as keyof typeof providers]
  if (!config) {
    throw new Error(`Unknown/Unsupported identity provider: ${provider}`)
  }

  // Fetch access/refresh tokens from provider
  let tokens: any = undefined
  if (code_verifier) {
    // Fetch access and refresh token
    tokens = await $fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUrl,
        code: code as string,
        code_verifier: code_verifier,
      }).toString(),
    }).catch((error) => {
      return {error}
    })
  } else {
    // Fetch access and refresh token
    tokens = await $fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUrl,
        code: code as string,
      }).toString(),
    }).catch((error) => {
      return {error}
    })
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

  return sendRedirect(event, "/")
})