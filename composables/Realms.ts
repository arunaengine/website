import EventBus from "~/composables/EventBus";

// by convention, composable function names start with "use"
export async function useRealms() {
  // state encapsulated and managed by the composable
  const realms: Ref<Realm[] | null> = ref(null)
  const {refresh: refreshRealms} = await useFetch<GetRealmsFromUserResponse>('/api/v3/realms', {
    server: false,
    lazy: true,
    onResponse({response}) {
      if (response) {
        realms.value = response._data.realms
        return
      }

      console.warn('[GetRealmsFromUser] Response was undefined. Returning empty array.')
      realms.value = []
    }
  })

  // a composable can update its managed state over time.
  EventBus.on('updateRealms', async () => {
    console.log('Triggered realms update')
    await refreshRealms()
  })

  // expose managed state (and refresh alternative) as return value
  return {realms, refreshRealms}
}