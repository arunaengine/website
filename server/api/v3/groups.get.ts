import {GetGroupsFromUserResponse} from "~/composables/aruna_v3/GetGroupsFromUserResponse";

export default defineEventHandler(async event => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/api/v3/users/groups`

  // Just return empty if unauthorized
  if (!event.context.access_token)
    return []

  return await $fetch<GetGroupsFromUserResponse>(fetchUrl, {
    headers: {
      'Authorization': `Bearer ${event.context.access_token}`
    }
  }).then(response => {
    if (response) {
      /*
      for (const [group, permission] of response.groups) {
        console.log(permission, group)
      }
      */
    }
    return response
  }).catch(error => {
    console.dir(error.data)
  })
})