


import type { v2GetResourceResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const resourceId = getQuery(event)['resourceId']    
    const fetchUrl = `https://api.dev.aruna-storage.org/v2/resources/${resourceId}`
    const response = await $fetch<v2GetResourceResponse>(fetchUrl, {
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        }
    })

    return response.resource
})