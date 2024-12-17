import {GetEventsResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/info/events`

  console.log('[GetEventsRoute]', query)
  if (!query.subscriber_id) {
    return {events: []}
  }

  return await $fetch<GetEventsResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
    query: query
  }).then(response => {
    if (response) {
      //console.log('[GetEventsRoute]', response)
      return response
    }
  })
})