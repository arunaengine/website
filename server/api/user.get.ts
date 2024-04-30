import {v2GetUserResponse} from '~/composables/aruna_api_json'
import {ArunaError} from "~/composables/ArunaError";

export default defineEventHandler(async event => {
  const userId = getQuery(event)['userId']
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/user`

  return await $fetch<v2GetUserResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    }
  }).then(response => {
    return response.user ? response.user : new ArunaError(15, 'Returned user is undefined')
  }).catch(error => {
    return new ArunaError(error.data.code, error.data.message)
  })
})