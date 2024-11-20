import {parseJwt} from '@/server/utils/jwt'

export default defineEventHandler(async (event) => {
  if (import.meta.client) {
    return
  }

  // Get request URL
  const request = getRequestURL(event)

  // Search is public, resource fetch is semi-public and get endpoints is public
  if ((request.toString().includes('api/announcement') && event.method === 'GET') ||
      request.toString().includes('api/search') ||
      request.toString().includes('api/resource') ||
      (request.toString().includes('api/endpoint') && event.method === 'GET')) {
    return // No authentication needed
  }

  // All remaining api routes
  if (request.toString().includes('api')) {
    const current_timestamp = Math.floor(Date.now() / 1000)

    // Fetch token cookies
    let access_token = getCookie(event, 'access_token')
    let refresh_token = getCookie(event, 'refresh_token')

    if (access_token) {
      event.context.access_token = access_token
      const parsed_access_token = parseJwt(access_token)
      const access_expiry = parsed_access_token.exp || 0

      // Check if expired or about to expire
      if (refresh_token && access_expiry - current_timestamp <= 30) {
        const parsed_refresh_token = parseJwt(refresh_token)
        const refresh_expiry = parsed_refresh_token.exp || 0
        const issuer: string | undefined = parsed_refresh_token.iss

        // Evaluate if refresh token is also expired
        if (refresh_expiry - current_timestamp < 0) {
          return // Maybe redirect to login page of issuer?
        }

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

        // Refresh tokens
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
        }).then((tokens: any) => {
          // Refresh access_token of request
          event.context.access_token = tokens.access_token

          // Refresh token cookies
          setCookie(event, 'access_token', tokens.access_token,
              {
                httpOnly: false,
                secure: true,
                sameSite: 'none',
                maxAge: tokens.expires_in,
              }
          )
          setCookie(event, 'refresh_token', tokens.refresh_token, {
            httpOnly: false,
            secure: true,
            sameSite: 'none',
            maxAge: tokens.refresh_expires_in,
          })
        }).catch((error) => {
          console.error('error', error)
          return {error}
        })
      }
    }
  }
})