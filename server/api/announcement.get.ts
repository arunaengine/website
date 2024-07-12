import type {v2GetAnnouncementResponse} from '~/composables/aruna_api_json'

export default defineEventHandler(async event => {
  const announcementId = getQuery(event)['announcementId']
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/info/announcements/${announcementId}`
  return await $fetch<v2GetAnnouncementResponse>(fetchUrl)
      .then(response => {
        return response.announcement
      }).catch(error => {
        console.error('[API Error]', error)
        return undefined
      })
})