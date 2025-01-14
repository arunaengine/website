import {AddComponentToRealmResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  const patchUrl = `${baseUrl}/api/v3/realms/${body.realm_id}/components/${body.component_id}`

  return await $fetch<AddComponentToRealmResponse>(patchUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
  }).then(response => {
    console.log('[AddComponentToRealm Server]', response)
    return response
  })
})