import {UpdateResourceTitleResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl

  return await $fetch<UpdateResourceTitleResponse>(`${baseUrl}/api/v3/resources/title`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  }).then(response => {
    console.log('[UpdateTitle Server]', response)
    return response
  })
})