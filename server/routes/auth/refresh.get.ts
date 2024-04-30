
export default defineEventHandler(async (event) => {
    if (process.client) {
        return
    }

    const config = useRuntimeConfig().provider.local;
    const realmURL = `${config.serverUrl}/realms/${config.realm}`
    const tokenURL = `${realmURL}/protocol/openid-connect/token`
    const refresh_token = getCookie(event, 'refresh_token')
    const access_token = getCookie(event, 'access_token')

    if (refresh_token) {
        const refresh_expiry = parseJwt(refresh_token).exp
        const access_expiry = access_token ? parseJwt(access_token).exp : 0
        const current_timestamp = Math.floor(Date.now() / 1000)
        const access_expired = access_expiry - current_timestamp <= 60 // Only one minute left or less

        console.log(`${refresh_expiry} - ${access_expiry} - ${current_timestamp} - ${access_expiry - current_timestamp} - ${access_expired}`)

        if (refresh_expiry > current_timestamp && access_expired) {
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

            // Set cookie values with refreshed tokens
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
        }
    }
})

export function parseJwt(token: any) {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}