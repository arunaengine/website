import type {v2GetUploadURLResponse} from '~/composables/aruna_api_json'
import {ArunaError} from "~/composables/ArunaError";

export default defineEventHandler(async event => {
    const resourceId = getRouterParam(event, 'id')
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/objects/${resourceId}/upload`
    return await $fetch<v2GetUploadURLResponse | ArunaError>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    }).catch(error => {
        console.log(typeof error.data)

        // If unauthenticated propagate error data
        if (error.data.code === 13) {
            console.log('Return ArunaError')
            return new ArunaError(error.data.code, error.data.message)
        }
    })
})