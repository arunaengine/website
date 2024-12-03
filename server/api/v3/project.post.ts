import {CreateResourceResponse} from "~/composables/aruna_v3/CreateResourceResponse";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl

  return await $fetch<CreateResourceResponse>(`${baseUrl}/api/v3/resources/projects`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  })
})