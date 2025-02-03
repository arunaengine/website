import {CreateLicensesResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  return await $fetch<CreateLicensesResponse>(`${baseUrl}/api/v3/license`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  })
})