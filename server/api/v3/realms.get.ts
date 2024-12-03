import {GetRealmsFromUserResponse} from "~/composables/aruna_v3/GetRealmsFromUserResponse";

export default defineEventHandler(async event => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/users/realms`

  // Just return empty if unauthorized
  if (!event.context.access_token)
    return []

  return await $fetch<GetRealmsFromUserResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    }
  })
})