
import type { v2GetUserResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    //const userId = getQuery(event)['userId']
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/user` // userId ? `"http://localhost:8080/v2/user?userId=${userId}"` : 'http://localhost:8080/v2/user';
    const authToken = parseCookies(event)[`${useRuntimeConfig().openidConnect.config.cookiePrefix}access_token`]
    const response = await $fetch<v2GetUserResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })

    return response.user
})