import type {v2UpdateCollectionTitleResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  const collectionId = getRouterParam(event, 'id')
  const request = await readBody(event)

  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/collections/${collectionId}/title`
  return await $fetch<v2UpdateCollectionTitleResponse>(fetchUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: request
  })
})