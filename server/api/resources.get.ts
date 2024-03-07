
import type { v2GetResourcesResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {

    const test = event.context.params
    console.log(test)

    const resourceIds = getQuery(event)['resourceIds']
    const authToken = parseCookies(event)["oidc._access_token"]

    const fetchUrl = new URL('http://localhost:8080/v2/resources')
    if (resourceIds) {
        resourceIds.forEach(element => {
            fetchUrl.searchParams.append('resourceIds', element)
        });
    }
    console.log(fetchUrl.toString())

    const response = await $fetch<v2GetResourcesResponse>(fetchUrl.toString(), {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })

    return response.resources
})