import EventBus from "~/composables/EventBus";

// by convention, composable function names start with "use"
export async function useEvents(refs: Ref[], user_id: Ref<string | undefined>) {
  // state encapsulated and managed by the composable
  const events: Ref<BaseTx[] | null> = ref(null)
  const {refresh: refreshEvents} = await useFetch<GetEventsResponse>('/api/v3/events', {
    server: false,
    lazy: true,
    watch: refs,
    query: {
      subscriber_id: user_id
    },
    onResponse({response}) {
      let v3Events: any[] = []
      if (response.ok) {
        for (const event of response._data.events) {
          const event_id = Object.keys(event)[0]
          if (event_id) {
            let eventMeta = event[event_id]
            eventMeta.event_id = event_id
            v3Events.push(eventMeta)
          }
        }
      } else {
        console.warn('[GetEvents] Response was not ok', response)
      }

      events.value = v3Events
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