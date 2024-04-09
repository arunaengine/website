
import type { v2GetResourcesResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const resourceIds = getQuery(event)['resourceIds']

    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = new URL(`${baseUrl}/v2/resources`)

    if (typeof resourceIds === 'string') {
        fetchUrl.searchParams.append('resourceIds', resourceIds)
    } else {
        resourceIds.forEach(element => {
            fetchUrl.searchParams.append('resourceIds', element)
        });
    }

    const response = await $fetch<v2GetResourcesResponse>(fetchUrl.toString(), {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })

    return response.resources
})