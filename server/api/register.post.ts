import { v2RegisterUserRequest } from "~/composables/aruna_api_json/models/v2RegisterUserRequest"

export default defineEventHandler(async event => {
    const request = await readBody(event)

    const final_body = {
        displayName: request.name,
        email: request.email,
        project: request.project,
    }

    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/user/register` 
    const response = await $fetch<v2RegisterUserRequest>(fetchUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        },
        body: final_body
    })

    return response.displayName
})