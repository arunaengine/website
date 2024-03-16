
import type { v2ActivateUserResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    let userId = event.context.params?.id
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/user/${userId}/activate`
    const response = await $fetch<v2ActivateUserResponse>(fetchUrl, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })

    return response
})