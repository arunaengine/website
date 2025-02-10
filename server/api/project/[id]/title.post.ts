import type {v2UpdateProjectTitleResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  const projectId = getRouterParam(event, 'id')
  const request = await readBody(event)

  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/project/${projectId}/title`
  return await $fetch<v2UpdateProjectTitleResponse>(fetchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    body: request
  })
})