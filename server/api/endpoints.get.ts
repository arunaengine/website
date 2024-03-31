
import type { v2GetEndpointsResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/endpoints`
    const response = await $fetch<v2GetEndpointsResponse>(fetchUrl)

    return response.endpoints
})