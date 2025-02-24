import {UpdateResourceNameResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl

  return await $fetch<UpdateResourceNameResponse>(`${baseUrl}/api/v3/resources/name`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  }).then(response => {
    console.log('[UpdateName Server]', response)
    return response
  })
})