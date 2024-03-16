
import type { v2CreateAPITokenResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const request = await readBody(event)
    const baseUrl = useRuntimeConfig().serverHostUrl

    const apiEndpoint = `${baseUrl}/v2/user/tokens`

    const response = await $fetch<v2CreateAPITokenResponse>(apiEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        },
        body: request
    })

    return response
})