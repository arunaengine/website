import type { v2CreateProjectResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const request = await readBody(event)
    const apiEndpoint = `http://localhost:8080/v2/projects`
    const response = await $fetch<v2CreateProjectResponse>(apiEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        },
        body: request
    })

    return response.project
})