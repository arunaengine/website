import type {v2UpdateProjectDescriptionResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  const projectId = getRouterParam(event, 'id')
  const request = await readBody(event)

  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/projects/${projectId}/description`
  return await $fetch<v2UpdateProjectDescriptionResponse>(fetchUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: request
  })
})