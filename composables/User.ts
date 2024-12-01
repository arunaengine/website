import EventBus from "~/composables/EventBus";
import type {GetUserResponse} from "~/composables/api_wrapper";

// by convention, composable function names start with "use"
export async function useUser(maintenanceMode: boolean) {
  // state encapsulated and managed by the composable
  const user: Ref<User | undefined> = ref(undefined)
  const unregistered: Ref<boolean> = ref(false)
  const {refresh: refreshUser} = await useFetch<GetUserResponse>('/api/v3/user', {
    server: false,
    lazy: true,
    immediate: !maintenanceMode,
    onResponse({response}) {
      if (response.ok) {
        user.value = response._data.user
        unregistered.value = false
        return
      }

      // Logout if user fetch fails
      user.value = undefined
    },
    onResponseError({response}) {
      console.error('[GetUser] Fetch Error:', response._data)
      user.value = undefined

      if (response._data.statusCode === 404)
        unregistered.value = true
    }
  })

  // a composable can update its managed state over time.
  EventBus.on('updateUser', async () => {
    console.log('Triggered user update')
    await refreshUser()
  })

  // expose managed state (and refresh alternative) as return value
  return {user, unregistered, refreshUser}
}