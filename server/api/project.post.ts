import type { v2CreateProjectResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const request = await readBody(event)
    const apiEndpoint = `http://localhost:8080/v2/projects`
    const token = parseCookies(event)["access_token"]
    const response = await $fetch<v2CreateProjectResponse>(apiEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: request
    })

    return response.project
})