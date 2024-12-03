import {GetStatsResponse} from "~/composables/aruna_v3/GetStatsResponse";

export default defineEventHandler(async event => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/info/stats`

  return await $fetch<GetStatsResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    }
  })
})