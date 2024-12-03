import EventBus from "~/composables/EventBus";

// by convention, composable function names start with "use"
export async function useStats(refs: Ref[] | undefined) {
  // state encapsulated and managed by the composable
  const {data: stats, refresh: refreshStats} = await useFetch<GetStatsResponse>('/api/v3/stats', {
    server: false,
    lazy: true,
    watch: refs
  })

  // a composable can update its managed state over time.
  EventBus.on('updateStats', async () => {
    console.log('Triggered stats update')
    await refreshStats()
  })

  // expose managed state (and refresh alternative) as return value
  return {stats, refreshStats}
}