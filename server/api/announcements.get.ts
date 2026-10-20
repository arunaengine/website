import type {v2GetAnnouncementsResponse} from '~/composables/aruna_api_json'

// The list only needs the card fields, so the full article text is dropped.
// Responses are cached for one minute so new posts appear quickly.
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
  maxAge: 60,
  swr: false,
  getKey: event => JSON.stringify(getQuery(event)),
})
