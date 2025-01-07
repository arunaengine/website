import {CreateS3CredentialsResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const baseUrl = useRuntimeConfig().serverHostUrl

  return await $fetch<CreateS3CredentialsResponse>(`${baseUrl}/api/v3/users/s3credentials`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: body
  }).then(response => {
    console.log('[CreateS3Credentials Server]', response)
    return response
  })
})