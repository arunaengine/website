import type {v2GetAnnouncementsResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  const pagination = getQuery(event)
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/info/announcements`
  return await $fetch<v2GetAnnouncementsResponse>(fetchUrl, {
    query: pagination ? pagination : {}
  })
})