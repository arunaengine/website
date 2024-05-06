import type { v2GetEndpointResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const resourceId = getQuery(event)['endpointId']
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/endpoints/${resourceId}`
    const response = await $fetch<v2GetEndpointResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })

    return response.endpoint
})