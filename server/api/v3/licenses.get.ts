import {GetLicensesResponse} from "~/composables/api_wrapper";

export default defineEventHandler(async event => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/license`

  return await $fetch<GetLicensesResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    },
  }).then(response => {
    if (response) {
      /*
      for (const event of response.events) {
        console.log('[GetEvents Server]', event[Object.keys(event)[0]])
      }
      */
      //console.dir('[GetEvents Server]', response)

      return response.licenses
    }
  })
})