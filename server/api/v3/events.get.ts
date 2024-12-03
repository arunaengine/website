import {GetEventsResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/info/events`

  return await $fetch<GetEventsResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    query: query
  })
})