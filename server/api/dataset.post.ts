import type { v2CreateDatasetResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const request = await readBody(event)
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/datasets`
    const response = await $fetch<v2CreateDatasetResponse>(fetchUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        },
        body: request
    })

    return response.dataset
})