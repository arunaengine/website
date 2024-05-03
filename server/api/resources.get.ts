import type {v2GetResourcesResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const access_token = getCookie(event, 'access_token') // Does not matter if undefined
    const resourceIds = getQuery(event)['resourceIds']
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = new URL(`${baseUrl}/v2/resources`)

    if (typeof resourceIds === 'string') {
        fetchUrl.searchParams.append('resourceIds', resourceIds)
    } else if (Array.isArray(resourceIds)) {
        resourceIds.forEach(element => {
            fetchUrl.searchParams.append('resourceIds', element)
        });
    }

    const response = await $fetch<v2GetResourcesResponse>(fetchUrl.toString(), {
        headers: access_token ? {
            'Authorization': `Bearer ${access_token}`
        } : {}
    })

    return response.resources
})