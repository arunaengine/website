import {GetRealmComponentsResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const id = getQuery(event)['id']
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/realms/${id}/components`

  return await $fetch<GetRealmComponentsResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
  }).then(response => {
    console.log('[GetRealmComponents Server]', response)
    return response
  })
})