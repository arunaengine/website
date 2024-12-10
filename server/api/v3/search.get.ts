import {SearchResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/info/search`
  const query = getQuery(event)

  return await $fetch<SearchResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    query: query
  })
})