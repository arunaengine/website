import type { v2DeleteAPITokenResponse } from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const tokenId = getQuery(event)['tokenId']
    if (tokenId === undefined) {
        throw Error('No token id provided')
    }

    const baseUrl = useRuntimeConfig().serverHostUrl
    const fetchUrl = `${baseUrl}/v2/user/tokens/${tokenId}`
    const access_token = getCookie(event, 'access_token')

    return await $fetch<v2DeleteAPITokenResponse>(fetchUrl, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    })
})