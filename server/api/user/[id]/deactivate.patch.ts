
import type { v2DeactivateUserResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {

    let userId = event.context.params?.id
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/user/${userId}/deactivate`
    const response = await $fetch<v2DeactivateUserResponse>(fetchUrl, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })

    return response
})