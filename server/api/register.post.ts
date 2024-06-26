import {v2RegisterUserResponse} from "~/composables/aruna_api_json";

export default defineEventHandler(async event => {
    const body = await readBody(event)
    const baseUrl = useRuntimeConfig().serverHostUrl
    return await $fetch<v2RegisterUserResponse>(`${baseUrl}/v2/user/register`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        },
        body: body
    })
})