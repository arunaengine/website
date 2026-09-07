import type { GroupPermissionLevel, RestrictedFile } from '@/lib/api'
import { createGroupRole, getGroup } from './aruna/groups'

export interface PublicReadGrant {
  granted: RestrictedFile[]
  /** Files without a permission path, or whose path a role would read as a pattern. */
  unresolved: RestrictedFile[]
}

// Role paths are glob patterns on the node; a literal path holding one of these
// would widen or miss the grant.
const GLOB_CHARACTERS = /[*?[\]{}]/

// There is no role update API, so a repeated grant gets its own numbered role.
async function freeRoleName(groupId: string, roleName: string): Promise<string> {
  const taken = new Set((await getGroup(groupId)).roles.map((role) => role.name))
  if (!taken.has(roleName)) return roleName
  for (let index = 2; ; index++) {
    const candidate = `${roleName} (${index})`
    if (!taken.has(candidate)) return candidate
  }
}

/** Grants everyone READ on exactly the listed files through one public group role. */
export async function grantPublicRead(
  groupId: string,
  roleName: string,
  files: RestrictedFile[],
): Promise<PublicReadGrant> {
  const permissions: Record<string, GroupPermissionLevel> = {}
  const granted: RestrictedFile[] = []
  const unresolved: RestrictedFile[] = []
  for (const file of files) {
    if (!file.permission_path || GLOB_CHARACTERS.test(file.permission_path)) {
      unresolved.push(file)
      continue
    }
    permissions[file.permission_path] = 'read'
    granted.push(file)
  }
  if (granted.length) {
    await createGroupRole(groupId, { name: await freeRoleName(groupId, roleName), permissions, public: true })
  }
  return { granted, unresolved }
}
