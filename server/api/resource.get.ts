import type { v2GetResourceResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const access_token = getCookie(event, 'access_token') // Does not matter if undefined
    const resourceId = getQuery(event)['resourceId']   
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/resources/${resourceId}`

    return await $fetch<v2GetResourceResponse>(fetchUrl, {
        headers: access_token ? {
            'Authorization': `Bearer ${access_token}`
        } : {}
    })
})