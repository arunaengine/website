import type { GroupPermissionLevel, RestrictedFile } from '@/lib/api'
import { createGroupRole, getGroup } from './aruna/groups'
import { isGroupAdmin } from '@/lib/groupAdmin'
import { assertCurrentSession, refreshContext } from './aruna/state'

export interface PublicReadGrant {
  granted: RestrictedFile[]
  /** Files without a permission path, or whose path a role would read as a pattern. */
  unresolved: RestrictedFile[]
  failed: boolean
}

// Role paths are glob patterns on the node; a literal path holding one of these
// would widen or miss the grant.
const GLOB_CHARACTERS = /[\\*?[\]{}]/

// There is no role update API, so a repeated grant gets its own numbered role.
function freeRoleName(names: string[], roleName: string): string {
  const taken = new Set(names)
  if (!taken.has(roleName)) return roleName
  for (let index = 2; ; index++) {
    const candidate = `${roleName} (${index})`
    if (!taken.has(candidate)) return candidate
  }
}

/** Grants everyone READ in each owning group the caller administers. */
export async function grantPublicRead(
  roleName: string,
  files: RestrictedFile[],
  userId: string,
): Promise<PublicReadGrant> {
  const epoch = refreshContext().epoch
  const groups = new Map<string, RestrictedFile[]>()
  const granted: RestrictedFile[] = []
  const unresolved: RestrictedFile[] = []
  let failed = false
  for (const file of files) {
    if (!file.group_id || !file.permission_path || GLOB_CHARACTERS.test(file.permission_path)) {
      unresolved.push(file)
      continue
    }
    const entries = groups.get(file.group_id) ?? []
    entries.push(file)
    groups.set(file.group_id, entries)
  }
  for (const [groupId, entries] of groups) {
    try {
      assertCurrentSession(epoch)
      const detail = await getGroup(groupId)
      assertCurrentSession(epoch)
      const prefix = `/${detail.realm_id}/g/${groupId}/data/`
      if (!isGroupAdmin(detail, userId) || entries.some((file) => !file.permission_path!.startsWith(prefix))) {
        unresolved.push(...entries)
        continue
      }
      const permissions: Record<string, GroupPermissionLevel> = Object.fromEntries(
        entries.map((file) => [file.permission_path!, 'read']),
      )
      await createGroupRole(groupId, {
        name: freeRoleName(detail.roles.map((role) => role.name), roleName), permissions, public: true,
      })
      granted.push(...entries)
    } catch {
      unresolved.push(...entries)
      failed = true
    }
  }
  assertCurrentSession(epoch)
  return { granted, unresolved, failed }
}
