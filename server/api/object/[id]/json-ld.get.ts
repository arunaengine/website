import {ResourceInfo} from "~/composables/ResourceInfo";

interface ResourceInfoResponse extends Response {
  resource: ResourceInfo
  jsonLd: Object
}

export default defineEventHandler(async event => {
  const resourceId = getRouterParam(event, 'id')
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/resources/${resourceId}`

  const {jsonLd} = await $fetch<ResourceInfoResponse>('/api/resource-info', {
    query: {
      resourceId: resourceId
    }
  })

  return jsonLd ? jsonLd : {}
})