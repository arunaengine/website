import {UpdateResourceDescriptionResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl

  return await $fetch<UpdateResourceDescriptionResponse>(`${baseUrl}/api/v3/resources/description`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  }).then(response => {
    console.log('[UpdateDescription Server]', response)
    return response
  })
})