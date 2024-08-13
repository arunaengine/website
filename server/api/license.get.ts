import {fetchCachedLicense} from "~/server/utils/licence";

export default defineEventHandler(async event => {
  const licenseTag = getQuery(event)['tag']
  return await fetchCachedLicense(licenseTag as string)
})