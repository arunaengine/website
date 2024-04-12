import type {v2GetUploadURLResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const resourceId = getRouterParam(event, 'id')
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/objects/${resourceId}/upload`
    return await $fetch<v2GetUploadURLResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })
})