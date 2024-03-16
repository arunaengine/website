
import type { v2GetAllUsersResponse, v2GetUserResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const fetchUrl = "http://localhost:8080/v2/user/list";
    const token = parseCookies(event)["access_token"]
    const response = await $fetch<v2GetAllUsersResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    return response.user
})