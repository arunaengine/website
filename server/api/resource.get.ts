


import type { v2GetResourceResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const resourceId = getQuery(event)['resourceId']    
    const fetchUrl = `https://api.dev.aruna-storage.org/v2/resources/${resourceId}`
    const token = parseCookies(event)["access_token"]
    const response = await $fetch<v2GetResourceResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    return response.resource
})