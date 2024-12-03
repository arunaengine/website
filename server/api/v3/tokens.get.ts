import type {GetTokensFromUserResponse} from '~/composables/api_wrapper'

export default defineEventHandler(async event => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/users/tokens`

  // Just return empty if unauthorized
  if (!event.context.access_token)
    return []

  return await $fetch<GetTokensFromUserResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    }
  })
})