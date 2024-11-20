
import type {v2AddOidcProviderResponse, v2CreateAPITokenResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
    const {accessToken, newAccessToken} = await readBody(event)
    const baseUrl = useRuntimeConfig().serverHostUrl
    const apiEndpoint = `${baseUrl}/v2/user/add_oidc`

    return await $fetch<v2AddOidcProviderResponse>(apiEndpoint, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
        body: {
          newAccessToken: newAccessToken
        }
    })
})