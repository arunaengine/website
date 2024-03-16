
import { v2GetUserResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    //const userId = getQuery(event)['userId']
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/user` // userId ? `"http://localhost:8080/v2/user?userId=${userId}"` : 'http://localhost:8080/v2/user';
    const response = await $fetch<v2GetUserResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    }).catch((error) => {
        if (error.data.message === "Not registered") {
            return "not_registered" as string
        }
        return error.data.message as string
    })

    if (typeof response === "string") {
        return response
    }else{
        return response.user
    }
})