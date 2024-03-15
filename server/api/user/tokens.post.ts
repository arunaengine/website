
import type { v2CreateAPITokenResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const request = await readBody(event)
    const baseUrl = useRuntimeConfig().serverHostUrl

    const apiEndpoint = `${baseUrl}/v2/user/tokens`
    const token = parseCookies(event)["oidc._access_token"]

    const response = await $fetch<v2CreateAPITokenResponse>(apiEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: request
    })

    return response
})