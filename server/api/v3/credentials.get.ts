import {GetS3CredentialsFromUserResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/users/s3credentials`

  return await $fetch<GetS3CredentialsFromUserResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
  }).then(response => {
    console.log('[GetS3CredentialsFromUser Server]', response)
    return response
  })
})