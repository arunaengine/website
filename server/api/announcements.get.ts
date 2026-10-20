import type {v2GetAnnouncementsResponse} from '~/composables/aruna_api_json'

// The list only needs the card fields, so the full article text is dropped.
// Responses are cached for a few minutes and refreshed in the background.
export default defineCachedEventHandler(async event => {
  const pagination = getQuery(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/info/announcements`
  const response = await $fetch<v2GetAnnouncementsResponse>(fetchUrl, {
    query: pagination ? pagination : {}
  })
  return {
    ...response,
    announcements: (response.announcements || []).map(({content, ...card}) => card)
  }
}, {
  group: 'news',
  name: 'announcement-list',
  maxAge: 300,
  swr: true,
  getKey: event => JSON.stringify(getQuery(event)),
})
