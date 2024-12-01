import {RegisterUserResponse} from "~/composables/aruna_v3/RegisterUserResponse";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  return await $fetch<RegisterUserResponse>(`${baseUrl}/api/v3/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  })
})