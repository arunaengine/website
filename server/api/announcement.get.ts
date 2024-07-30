import {fetchConvertedAnnouncement} from "~/server/utils/announcement";

export default defineEventHandler(async event => {
  const announcementId = getQuery(event)['announcementId']
  return await fetchConvertedAnnouncement(announcementId as string)
})
