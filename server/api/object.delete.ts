import type {apistorageservicesv2DeleteObjectResponse, v2CreateObjectResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const objectId = getQuery(event)['objectId']
    const request = await readBody(event)
    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/objects/${objectId}`

    return await $fetch<apistorageservicesv2DeleteObjectResponse>(fetchUrl, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${event.context.access_token}`
        },
        body: request
    })
})