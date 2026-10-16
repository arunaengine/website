// The provider bucket that holds a whole Aruna bucket, read from the group's
// linked buckets on the browsed node. Only group admins may read them; everyone else gets null.
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { nodeApiBase } from '@/composables/s3/endpoints'
import { getGroupBackends, listBackendImports, type BackendImport, type GroupBackendResponse } from '@/lib/api'
import { splitPath, splitsBuckets } from '@/lib/storageRules'

export function useProviderBucket(
  bucket: Ref<string>,
  groupId: Ref<string | null | undefined>,
  nodeId: Ref<string | null>,
) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const links = ref<BackendImport[]>([])
  const backends = ref<GroupBackendResponse[]>([])
  let seq = 0

  // Once per group and node: the links of every bucket arrive in one list.
  watch(
    [groupId, nodeId, sessionEpoch],
    async ([id, node]) => {
      const current = ++seq
      links.value = []
      backends.value = []
      const baseUrl = node ? nodeApiBase(node) : apiBaseUrl.value
      if (!id || !baseUrl) return
      try {
        const client = { baseUrl, token: authToken.value }
        const [listed, all] = await Promise.all([getGroupBackends(id, client), listBackendImports(id, client)])
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
