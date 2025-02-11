import type {v2UpdateObjectTitleResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  const objectId = getRouterParam(event, 'id')
  const request = await readBody(event)

  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/objects/${objectId}/title`
  return await $fetch<v2UpdateObjectTitleResponse>(fetchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: request
  })
})