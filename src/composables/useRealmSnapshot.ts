// The realm's node list as a view shows it. In the desktop the serving node is this computer's own,
// which sees no live heartbeats or names of other nodes, so the list is read from a realm node.
import { computed, ref, watch } from 'vue'
import type { RealmView } from '@/composables/aruna/realm'
import { useAruna } from '@/composables/useAruna'
import { isDesktop } from '@/lib/desktop'

export function useRealmSnapshot() {
  const { realmInfo, sessionEpoch, loadRealmView } = useAruna()
  const view = ref<RealmView | null>(null)
  let generation = 0
  watch([sessionEpoch, () => realmInfo.value?.realm_id], () => {
    generation++
    view.value = null
  }, { flush: 'sync' })
  watch(realmInfo, async () => {
    if (!isDesktop()) return
    const mine = generation
    const loaded = await loadRealmView()
    if (mine === generation) view.value = loaded
  }, { immediate: true })
  return { view, realm: computed(() => view.value?.realm ?? realmInfo.value) }
}
