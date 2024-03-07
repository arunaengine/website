import type { v2CreateProjectResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const request = await readBody(event)
    console.log(request)
    const apiEndpoint = `http://localhost:8080/v2/projects`
    const token = parseCookies(event)["oidc._access_token"]
    const response = await $fetch<v2CreateProjectResponse>(apiEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: request
    })

    return response.project
})