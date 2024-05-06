import type {v2GetHierarchyResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const resourceId = getQuery(event)['resourceId']
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/relations/${resourceId}/hierarchy`
    return await $fetch<v2GetHierarchyResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })
})