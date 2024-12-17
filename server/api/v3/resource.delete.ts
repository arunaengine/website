import {DeleteResourcesResponse} from '~/composables/api_wrapper'

export default defineEventHandler(async event => {
  const id = getQuery(event)['id']
  const baseUrl = useRuntimeConfig().serverHostUrl

  return await $fetch<DeleteResourcesResponse>(`${baseUrl}/api/v3/resources/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    }
  }).then(response => {
    console.log('[DeleteResource Server]', response)
    return response
  })
})