import { listGroupDataPaths, type GroupPermissionLevel, type RestrictedFile } from '@/lib/api'
import { createGroupRole } from './aruna/groups'
import { refreshContext } from './aruna/state'

export interface PublicReadGrant {
  granted: RestrictedFile[]
  /** Files without a bucket the group owns or without a key; nothing was granted for them. */
  unresolved: RestrictedFile[]
}

// The group's buckets by name, each with the permission path a role grants on.
async function bucketPaths(groupId: string): Promise<Map<string, string>> {
  const paths = new Map<string, string>()
  let continuationToken: string | undefined
  do {
    const page = await listGroupDataPaths(groupId, { continuationToken }, refreshContext().client)
    for (const entry of page.entries) {
      const path = entry.permission_path.replace(/\/+$/, '')
      paths.set(path.split('/').pop() ?? path, path)
    }
    continuationToken = page.continuation_token
  } while (continuationToken)
  return paths
}

/** Grants everyone READ on exactly the listed files through one public group role. */
export async function grantPublicRead(
  groupId: string,
  roleName: string,
  files: RestrictedFile[],
): Promise<PublicReadGrant> {
  const buckets = await bucketPaths(groupId)
  const permissions: Record<string, GroupPermissionLevel> = {}
  const granted: RestrictedFile[] = []
  const unresolved: RestrictedFile[] = []
  for (const file of files) {
    const bucketPath = file.bucket ? buckets.get(file.bucket) : undefined
    if (!bucketPath || !file.key) {
      unresolved.push(file)
      continue
    }
    permissions[`${bucketPath}/${file.key}`] = 'read'
    granted.push(file)
  }
  if (granted.length) await createGroupRole(groupId, { name: roleName, permissions, public: true })
  return { granted, unresolved }
}
