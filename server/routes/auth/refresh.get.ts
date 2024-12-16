import {parseJwt} from '@/server/utils/jwt'

export default defineEventHandler(async (event) => {
  if (import.meta.client) {
    return
  }

  // Fetch token cookies
  const refresh_token = getCookie(event, 'refresh_token')
  const access_token = getCookie(event, 'access_token')

  // Evaluate refresh token
  if (refresh_token) {
    const current_timestamp = Math.floor(Date.now() / 1000)
    const parsed_refresh_token = parseJwt(refresh_token)
    const issuer: string | undefined = parsed_refresh_token.iss
    const refresh_expiry: number = parsed_refresh_token.exp || 0

    // Fetch provider specific config
    const providers = useRuntimeConfig().provider
    let config = undefined
    for (const alias in providers) {
      const conf = providers[alias as keyof typeof providers]

      if (conf && conf.issuer === issuer) {
        config = conf
        break
      }
    }

    if (!config) {
      throw new Error(`Unknown or unsupported issuer: ${issuer}`)
    }

    const parsed_access_token = access_token ? parseJwt(access_token) : undefined
    const access_expiry: number = parsed_access_token ? parsed_access_token.exp : 0
    if (refresh_expiry > current_timestamp && access_expiry - current_timestamp <= 60) {
      // Fetch refreshed tokens from issuer
      await $fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
        }).toString(),
      }).then((tokens: any) =>  {
        // Refresh token cookies on success
        if (tokens.access_token) {
          setCookie(event, 'access_token', tokens.access_token,
              {
                httpOnly: false,
                secure: true,
                sameSite: 'none',
                maxAge: tokens.expires_in,
              })
        }
        if (tokens.refresh_token) {
          setCookie(event, 'refresh_token', tokens.refresh_token, {
            httpOnly: false,
            secure: true,
            sameSite: 'none',
            maxAge: tokens.expires_in,
          })
        }
      }).catch((error) => {
        console.error('error', error)
        return {error}
      })
    }
  }
})