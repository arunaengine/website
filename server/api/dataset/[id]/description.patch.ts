import type {v2UpdateDatasetDescriptionResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  const datasetId = getRouterParam(event, 'id')
  const request = await readBody(event)

  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/datasets/${datasetId}/description`
  return await $fetch<v2UpdateDatasetDescriptionResponse>(fetchUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: request
  })
})