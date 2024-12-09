import EventBus from "~/composables/EventBus";
import type {GroupInfo} from '~/composables/api_wrapper'

// by convention, composable function names start with "use"
export async function useGroups() {
  // state encapsulated and managed by the composable
  const groups: Ref<GroupInfo[] | null> = ref(null)
  const {refresh: refreshGroups} = await useFetch<GetGroupsFromUserResponse>('/api/v3/groups', {
    server: false,
    lazy: true,
    onResponse({response}) {
      if (response) {
        groups.value = response._data.groups.map((ele: any) => {
          const [group, permission] = ele
          return {group: group, permission: permission} as GroupInfo
        })
        return
      }

      console.warn('[GetGroupsFromUser] Response was undefined. Returning empty array.')
      groups.value = []
    }
  })

  // a composable can update its managed state over time.
  EventBus.on('updateGroups', async () => {
    console.log('Triggered groups update')
    await refreshGroups()
  })

  // expose managed state (and refresh alternative) as return value
  return {groups, refreshGroups}
}