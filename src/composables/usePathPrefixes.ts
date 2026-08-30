// The prefixes a new dataset may be stored under in one group: the caller's
// own grants come from the signed-in user info, the folders in use from one
// page of the group's documents.
import { computed, ref, watch, type Ref } from 'vue'
import { pathPrefixOptions, writablePrefixes } from '@/lib/crate/paths'
import { useAruna } from './useAruna'

const DOCUMENT_PAGE = 100

export function usePathPrefixes(groupId: Ref<string | undefined>) {
  const { userInfo, realm, listGroupMetadata } = useAruna()
  const paths = ref<string[]>([])
  const loading = ref(false)
  let generation = 0

  watch(groupId, async (id) => {
    const current = ++generation
    paths.value = []
    if (!id) return
    loading.value = true
    try {
      const page = await listGroupMetadata(id, { limit: DOCUMENT_PAGE })
      if (current === generation) paths.value = page.documents.map((doc) => doc.document_path)
    } catch {
      // Without the listing the grants alone still offer a prefix.
    } finally {
      if (current === generation) loading.value = false
    }
  }, { immediate: true })

  const roles = computed(() =>
    userInfo.value?.groups.find((group) => group.group_id === groupId.value)?.roles ?? [])
  const grants = computed(() => writablePrefixes(roles.value, realm.value.id, groupId.value ?? ''))
  const prefixes = computed(() => pathPrefixOptions({
    roles: roles.value,
    realmId: realm.value.id,
    groupId: groupId.value ?? '',
    documentPaths: paths.value,
  }))

  return {
    options: computed(() => prefixes.value.options),
    preselected: computed(() => prefixes.value.preselected),
    documentPaths: computed(() => paths.value),
    grants,
    loading,
  }
}
