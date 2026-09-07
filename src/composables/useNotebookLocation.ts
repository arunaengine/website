import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { activeGroupId } from '@/composables/useGroupSelection'
import { readStored, storeValue } from '@/composables/aruna/state'

interface NotebookLocation {
  bucket: string
  prefix: string
  key?: string
}

export function useNotebookLocation() {
  const { apiBaseUrl, currentUser, nodeInfo } = useAruna()
  const scope = computed(() => JSON.stringify([
    apiBaseUrl.value, currentUser.value?.id, nodeInfo.value?.node.realm_id,
    nodeInfo.value?.node.peer_id, activeGroupId.value,
  ]))
  const location = ref<NotebookLocation | null>(null)
  watch(scope, () => {
    location.value = null
    try {
      const saved = JSON.parse(readStored(`aruna.notebook-location.${scope.value}`) || 'null')
      if (saved && typeof saved.bucket === 'string' && typeof saved.prefix === 'string') {
        location.value = { bucket: saved.bucket, prefix: saved.prefix,
          ...(typeof saved.key === 'string' ? { key: saved.key } : {}) }
      }
    } catch { /* An unavailable or invalid browser preference starts at the bucket list. */ }
  }, { immediate: true })

  function remember(next: NotebookLocation) {
    if (!currentUser.value || !activeGroupId.value || !next.bucket) return
    if (!next.key && location.value?.bucket === next.bucket && location.value.key) {
      next = { ...next, key: location.value.key }
    }
    location.value = next
    storeValue(`aruna.notebook-location.${scope.value}`, JSON.stringify(next))
  }
  return { scope, location, remember }
}
