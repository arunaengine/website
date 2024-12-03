import {GetRelationsResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/resources/${query['node']}/relations?filter[]=0`

  // Just return empty if unauthorized
  if (!event.context.access_token)
    return []

  return await $fetch<GetRelationsResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    query: query,
  })
  /*
  .then(response => {
    console.dir(response)
    return response
  })
  */
})