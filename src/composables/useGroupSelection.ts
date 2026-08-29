// The group a selector starts on: the last one the user worked in, remembered
// in the browser and shared by every view that defaults a group.
import { computed, readonly, ref, watch, type Ref } from 'vue'
import { readStored, storeValue } from './aruna/state'
import { useAruna } from './useAruna'

export const LAST_GROUP_KEY = 'aruna.lastGroupId'

const lastGroupId = ref(readStored(LAST_GROUP_KEY))

/** Records the group in use, so the next view and the next visit start there. */
export function rememberGroup(groupId: string) {
  if (!groupId || groupId === lastGroupId.value) return
  lastGroupId.value = groupId
  storeValue(LAST_GROUP_KEY, groupId)
}

/**
 * Keeps `selected` on a group without asking: an empty selection takes the
 * remembered group, or the first membership when that group is gone, and every
 * change is remembered. An explicit choice is never overridden.
 */
export function useGroupSelection(selected: Ref<string>) {
  const { myGroups, loading, bootstrapped } = useAruna()

  // Memberships are unknown until the first bootstrap settles, so a view must
  // show its loading state rather than the "no group" one until then.
  const groupsLoading = computed(() => !bootstrapped.value || loading.value)
  const hasGroups = computed(() => myGroups.value.length > 0)
  const defaultGroupId = computed(() => {
    const groups = myGroups.value
    if (!groups.length) return ''
    const remembered = groups.some((group) => group.id === lastGroupId.value)
    return remembered ? lastGroupId.value : groups[0].id
  })

  watch(
    defaultGroupId,
    (groupId) => {
      if (groupId && !selected.value) selected.value = groupId
    },
    { immediate: true },
  )
  watch(selected, (groupId) => rememberGroup(groupId), { immediate: true })

  return { defaultGroupId, groupsLoading, hasGroups, lastGroupId: readonly(lastGroupId) }
}
