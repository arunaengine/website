import { apiRequest, type ApiClientOptions } from './client'
import type { ApiRole } from './users'

export interface ApiGroup {
  group_id: string
  display_name: string
  realm_id: string
  roles?: ApiRole[]
}

export interface ListGroupsResponse {
  groups: ApiGroup[]
}

export interface CreateGroupRequest {
  name: string
}

export interface GroupDetailResponse {
  display_name: string
  group_id: string
  realm_id: string
  roles: ApiRole[]
}

export interface GroupMemberRole {
  role_id: string
  name: string
}

export interface GroupMember {
  user_id: string
  name?: string
  roles: GroupMemberRole[]
}

export interface GroupMembersResponse {
  members: GroupMember[]
}

export interface AddGroupMemberRequest {
  user_id: string
  role_ids?: string[]
}

export interface GroupRolesResponse {
  roles: ApiRole[]
}

export type GroupPermissionLevel = 'read' | 'write' | 'deny'

export interface CreateGroupRoleRequest {
  name: string
  permissions: Record<string, GroupPermissionLevel>
  assigned_users?: string[]
  // Public roles apply to every principal, including anonymous requests.
  public?: boolean
}

// GET /groups/{id}/data-paths: browsable data permission paths that feed the
// role picker's data/ tree. Verified against aruna api/src/routes/groups.rs on
// branch feat/pb-datapaths (in flight, 2026-07-17): member-gated (403 for
// non-members, 401 unauthenticated), local node only in v1, and permission
// paths are shaped /{realm}/g/{group}/data/{node}/{bucket}/{key} exactly as
// consumed by role permissions (core blob_*_permission_path). An empty/absent
// `prefix` lists the group's buckets; pass a folder's `permission_path`
// (normalized with a trailing slash) as `prefix` to list its contents with
// `delimiter=/`. `kind` is serialized lowercase. A prefix outside the group's
// data root answers 400; a bucket owned by another group yields empty entries.
export type DataPathKind = 'folder' | 'object'

export interface DataPathEntry {
  permission_path: string
  kind: DataPathKind
}

export interface DataPathsResponse {
  entries: DataPathEntry[]
  // Opaque page token; omitted on the last page. Pass back verbatim.
  continuation_token?: string
}

export interface DataPathsQuery {
  prefix?: string
  delimiter?: string
  continuationToken?: string
  limit?: number
}

export async function listGroupDataPaths(
  groupId: string,
  params: DataPathsQuery = {},
  client: ApiClientOptions = {},
): Promise<DataPathsResponse> {
  return apiRequest<DataPathsResponse>(
    `/groups/${encodeURIComponent(groupId)}/data-paths`,
    {
      query: {
        prefix: params.prefix,
        delimiter: params.delimiter,
        continuation_token: params.continuationToken,
        limit: params.limit,
      },
    },
    client,
  )
}
