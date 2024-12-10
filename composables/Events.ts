import EventBus from "~/composables/EventBus";

// by convention, composable function names start with "use"
export async function useEvents(refs: Ref[], user: Ref<User | undefined>) {

  watch(user, () => console.log('[GetEvents] User updated:', user.value ? user.value.id : 'Undefined'))

  // state encapsulated and managed by the composable
  const events: Ref<any[] | null> = ref(null)
  const {refresh: refreshEvents} = await useFetch<GetEventsResponse>('/api/v3/events', {
    server: false,
    lazy: true,
    watch: refs,
    query: {
      subscriber_id: user.value ? user.value.id : ''
    },
    onResponse({response}) {
      if (response.ok) {
        console.log('[GetEvents]', response)
        events.value = response._data.events
        return
      }

      console.warn('[GetEvents] Response was not ok', response)
      events.value = []
    },
    onResponseError({response}) {
      console.error('[GetEvents] Error response:', response)
      events.value = []
    }
  })

  // a composable can update its managed state over time.
  EventBus.on('updateEvents', async () => {
    console.log('Triggered events update')
    await refreshEvents()
  })

  // expose managed state (and refresh alternative) as return value
  return {events, refreshEvents}
}