// The group a selector starts on: the last one the user worked in, remembered
// in the browser and shared by every view that defaults a group.
import { computed, readonly, ref, watch, type Ref } from 'vue'
import { readStored, storeValue } from './aruna/state'
import { useAruna } from './useAruna'

export const LAST_GROUP_KEY = 'aruna.lastGroupId'

const lastGroupId = ref(readStored(LAST_GROUP_KEY))

/** The group the portal works in: the remembered one, else the first membership. */
export const activeGroupId = computed(() => {
  const groups = useAruna().myGroups.value
  if (!groups.length) return ''
  const remembered = groups.some((group) => group.id === lastGroupId.value)
  return remembered ? lastGroupId.value : groups[0].id
})

/** Records the group in use, so the next view and the next visit start there. */
export function rememberGroup(groupId: string) {
  if (!groupId || groupId === lastGroupId.value) return
  lastGroupId.value = groupId
  storeValue(LAST_GROUP_KEY, groupId)
}

/** Switches the portal-wide group; a group without a membership is ignored. */
export function setActiveGroup(groupId: string) {
  if (!useAruna().myGroups.value.some((group) => group.id === groupId)) return
  rememberGroup(groupId)
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

  watch(
    activeGroupId,
    (groupId) => {
      if (groupId && !selected.value) selected.value = groupId
    },
    { immediate: true },
  )
  watch(selected, (groupId) => rememberGroup(groupId), { immediate: true })

  return {
    defaultGroupId: activeGroupId,
    groupsLoading,
    hasGroups,
    lastGroupId: readonly(lastGroupId),
  }
}

/**
 * Like `useGroupSelection`, and `selected` follows every later switch of the
 * portal-wide group, so a top-bar change reaches the view while it is open.
 */
export function useGroupContext(selected: Ref<string>) {
  const selection = useGroupSelection(selected)

  // Without a previous group this is the first resolution of the memberships,
  // which must not overwrite a deep link the view opened with.
  watch(activeGroupId, (groupId, previous) => {
    if (groupId && previous && groupId !== selected.value) selected.value = groupId
  })

  return selection
}
