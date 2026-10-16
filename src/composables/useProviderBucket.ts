// The provider bucket that holds a whole Aruna bucket, read from the group's
// linked buckets. Only group admins may read them; everyone else gets null.
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { listBackendImports, type BackendImport, type GroupBackendResponse } from '@/lib/api'
import { splitPath, splitsBuckets } from '@/lib/storageRules'

export function useProviderBucket(bucket: Ref<string>, groupId: Ref<string | null | undefined>) {
  const { apiBaseUrl, authToken, sessionEpoch, listGroupBackends } = useAruna()
  const links = ref<BackendImport[]>([])
  const backends = ref<GroupBackendResponse[]>([])
  let seq = 0

  // Once per group: the links of every bucket arrive in one list.
  watch(
    [groupId, sessionEpoch],
    async ([id]) => {
      const current = ++seq
      links.value = []
      backends.value = []
      if (!id) return
      try {
        const client = { baseUrl: apiBaseUrl.value, token: authToken.value }
        const [listed, all] = await Promise.all([listGroupBackends(id), listBackendImports(id, client)])
        if (current !== seq) return
        backends.value = listed.backends
        links.value = all
      } catch {
        // A refused or older node shows no line.
      }
    },
    { immediate: true },
  )

  return computed(() => {
    for (const link of links.value) {
      if (link.bucket !== bucket.value || link.key_prefix) continue
      const backend = backends.value.find((entry) => entry.backend_id === link.backend_id)
      if (backend && splitsBuckets(backend)) return splitPath(backend, link.backend_prefix).bucket || null
    }
    return null
  })
}
