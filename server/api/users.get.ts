
import type { v2GetAllUsersResponse, v2GetUserResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/user/list`
    const response = await $fetch<v2GetAllUsersResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })

    return response.user
})