import type {v2GetS3CredentialsUserTokenResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  let endpointId = event.context.params?.id
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/user/s3_credentials/${endpointId}`
  return await $fetch<v2GetS3CredentialsUserTokenResponse>(fetchUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    }
  })
})