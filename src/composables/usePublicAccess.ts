// The group role named "public" for one group: who may change it, what it
// covers, and the create-then-delete replacement the role API requires.
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { localNodeId } from '@/composables/s3/endpoints'
import type { GroupDetailResponse, GroupPermissionLevel } from '@/lib/api'
import { isGroupAdmin } from '@/lib/groupAdmin'
import {
  PUBLIC_ROLE_NAME,
  coveringRules,
  dataRoot,
  managedRole,
  targetPath,
  withGrants,
  withoutGrants,
  type PublicTarget,
} from '@/lib/publicAccess'
import { errorMessage } from '@/lib/utils'

export function usePublicAccess(groupId: Ref<string | null | undefined>) {
  const { currentUser, getGroup, createGroupRole, deleteGroupRole, realmInfo, nodeInfo } = useAruna()

  const detail = ref<GroupDetailResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let generation = 0

  async function load() {
    const id = groupId.value
    const current = ++generation
    detail.value = null
    error.value = null
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const response = await getGroup(id)
      if (current !== generation) return
      detail.value = response
    } catch (err) {
      if (current !== generation) return
      error.value = errorMessage(err)
    } finally {
      if (current === generation) loading.value = false
    }
  }

  watch(groupId, () => void load(), { immediate: true })

  const roles = computed(() => detail.value?.roles ?? [])
  const role = computed(() => managedRole(roles.value))
  const canManage = computed(() =>
    Boolean(detail.value && isGroupAdmin(detail.value, currentUser.value?.id ?? '')),
  )
  const groupName = computed(() => detail.value?.display_name ?? null)

  function root(nodeId: string | null | undefined): string {
    const realmId =
      detail.value?.realm_id ?? realmInfo.value?.realm_id ?? nodeInfo.value?.node.realm_id ?? ''
    return dataRoot(realmId, groupId.value ?? '', nodeId || (localNodeId() ?? ''))
  }

  function pathOf(nodeId: string | null | undefined, target: PublicTarget): string {
    return targetPath(root(nodeId), target)
  }

  /** The public rules that let everyone read the target; empty means private. */
  function rulesFor(nodeId: string | null | undefined, target: PublicTarget): string[] {
    return coveringRules(roles.value, pathOf(nodeId, target))
  }

  function isPublic(nodeId: string | null | undefined, target: PublicTarget): boolean {
    return rulesFor(nodeId, target).length > 0
  }

  // The role API has no update: the replacement is created first, so the
  // group is never without its public rules, then the old copy is removed.
  async function replaceRole(permissions: Record<string, GroupPermissionLevel>) {
    const id = groupId.value
    if (!id) throw new Error('No group is selected.')
    const previous = role.value
    if (Object.keys(permissions).length) {
      await createGroupRole(id, {
        name: PUBLIC_ROLE_NAME,
        permissions,
        assigned_users: [],
        public: true,
      })
    }
    if (previous) {
      try {
        await deleteGroupRole(id, previous.role_id)
      } catch (err) {
        throw new Error(
          `The updated "${PUBLIC_ROLE_NAME}" role was created, but the previous copy could not be removed: ${errorMessage(err)}. Delete it in the group's roles.`,
        )
      }
    }
    await load()
  }

  async function grant(nodeId: string | null | undefined, targets: readonly PublicTarget[]) {
    const paths = targets.map((target) => pathOf(nodeId, target))
    await replaceRole(withGrants(role.value?.permissions, paths))
  }

  async function revoke(nodeId: string | null | undefined, targets: readonly PublicTarget[]) {
    const paths = targets.map((target) => pathOf(nodeId, target))
    await replaceRole(withoutGrants(role.value?.permissions, paths))
  }

  return {
    detail,
    loading,
    error,
    role,
    roles,
    canManage,
    groupName,
    reload: load,
    root,
    pathOf,
    rulesFor,
    isPublic,
    grant,
    revoke,
  }
}

export type PublicAccess = ReturnType<typeof usePublicAccess>
