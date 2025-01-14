import {CreateComponentResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl

  return await $fetch<CreateComponentResponse>(`${baseUrl}/api/v3/global/components`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  }).then(response => {
    console.log('[CreateComponent Server]', response)
    return response
  })
})