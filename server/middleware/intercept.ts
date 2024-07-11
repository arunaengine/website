export default defineEventHandler(async (event) => {
  if (import.meta.client) {
        return
    }

    // Get request URL 
    const request = getRequestURL(event)

    // Search is public, resource fetch is semi-public and get endpoints is public
    if (request.toString().includes('api/search') ||
        request.toString().includes('api/resource') ||
        (request.toString().includes('api/endpoint') && event.method === 'GET'))
    {
        return // Just do nothing
    }

    const config = useRuntimeConfig().provider.local;
    const query = getQuery(event)
    const {code} = query

    const realmURL = `${config.serverUrl}/realms/${config.realm}`
    const tokenURL = `${realmURL}/protocol/openid-connect/token`
    
    if (request.toString().includes('api')) {
        let access_token = getCookie(event, 'access_token')
        if (!access_token) {
            const refresh_token = getCookie(event, 'refresh_token')
            if (!refresh_token) {
                //return sendRedirect(event, '/auth/login')
              return // Refresh impossible, so just do nothing
            } else {
                const tokens: any = await $fetch(tokenURL, {
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
                }).catch((error) => {
                    console.log('error', error)
                    return {error}
                })

                access_token = tokens.access_token

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
            }
        }

        event.context.access_token = access_token
    }

    //console.log('Request @ ' + getRequestURL(event))
})