import EventBus from "~/composables/EventBus";

// by convention, composable function names start with "use"
export async function useLicenses(refs: Ref[] | undefined) {
  // state encapsulated and managed by the composable
  const {data: licenses, refresh: refreshLicenses} = await useFetch<GetLicensesResponse>('/api/v3/licenses', {
    server: false,
    lazy: true,
    watch: refs
  })

  // a composable can update its managed state over time.
  EventBus.on('updateLicenses', async () => {
    console.log('Triggered licenses update')
    await refreshLicenses()
  })

  // expose managed state (and refresh alternative) as return value
  return {licenses, refreshLicenses}
}