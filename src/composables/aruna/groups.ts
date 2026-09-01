import { computed } from 'vue'
import type { Group } from '@/data/types'
import {
  type AddGroupMemberRequest,
  type ApiGroup,
  type ApiRole,
  type CreateGroupRoleRequest,
  type GroupDetailResponse,
  type GroupMembersResponse,
  type GroupRolesResponse,
  type UpdateGroupRequest,
  type UsageHistoryResolution,
  type UsageHistoryResponse,
  type UsageResponse,
} from '@/lib/api'
import { roleSummary, slugify } from './format'
import { loadAuthenticated } from './identity'
import { realm } from './realm'
import { apiGroups, request, saving, userInfo } from './state'

// Throws ApiError with status 409 and the server's verbatim message when the
// caller is over the owned-group cap.
export async function createGroup(name: string): Promise<GroupDetailResponse> {
  saving.value = true
  try {
    const created = await request<GroupDetailResponse>('/access/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    await loadAuthenticated().catch(() => undefined)
    return created
  } finally {
    saving.value = false
  }
}

// Only the label changes; the reload keeps /access/users/me, the group list and
// every name the switcher, search and admin tables render in step.
export async function updateGroup(
  groupId: string,
  input: UpdateGroupRequest,
): Promise<GroupDetailResponse> {
  saving.value = true
  try {
    const updated = await request<GroupDetailResponse>(`/access/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    await loadAuthenticated().catch(() => undefined)
    return updated
  } finally {
    saving.value = false
  }
}

export async function getGroup(groupId: string): Promise<GroupDetailResponse> {
  return request<GroupDetailResponse>(`/access/groups/${groupId}`)
}

export async function getGroupUsage(groupId: string): Promise<UsageResponse> {
  return request<UsageResponse>(`/access/groups/${groupId}/usage`)
}

// STUB against the assumed #250 history endpoint (see api.ts). On today's
// backends this 404s; callers gate on featureEnabled('usageHistory') and
// treat 404/405 as "backend does not serve history yet".
export async function getGroupUsageHistory(
  groupId: string,
  opts: { from?: string; to?: string; resolution?: UsageHistoryResolution } = {},
): Promise<UsageHistoryResponse> {
  return request<UsageHistoryResponse>(`/access/groups/${groupId}/usage/history`, { query: { ...opts } })
}

export async function listGroupMembers(groupId: string): Promise<GroupMembersResponse> {
  return request<GroupMembersResponse>(`/access/groups/${groupId}/members`)
}

export async function addGroupMember(groupId: string, input: AddGroupMemberRequest): Promise<GroupRolesResponse> {
  saving.value = true
  try {
    const response = await request<GroupRolesResponse>(`/access/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await loadAuthenticated().catch(() => undefined)
    return response
  } finally {
    saving.value = false
  }
}

export async function removeGroupMember(groupId: string, userId: string, roleId?: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/access/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      query: { role_id: roleId },
    })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

export async function leaveGroup(groupId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/access/groups/${groupId}/leave`, { method: 'POST' })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

export async function createGroupRole(groupId: string, input: CreateGroupRoleRequest): Promise<ApiRole> {
  saving.value = true
  try {
    const role = await request<ApiRole>(`/access/groups/${groupId}/roles`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await loadAuthenticated().catch(() => undefined)
    return role
  } finally {
    saving.value = false
  }
}

export async function deleteGroupRole(groupId: string, roleId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/access/groups/${groupId}/roles/${roleId}`, { method: 'DELETE' })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

// Distinct member ids per group, from /access/groups?include=roles. Only counted
// when the caller can see assigned_users (i.e. is a member of the group).
export const groupMemberCounts = computed<Map<string, number>>(() => {
  const counts = new Map<string, number>()
  for (const group of apiGroups.value) {
    const count = memberCount(group.roles)
    if (count !== undefined) counts.set(group.group_id, count)
  }
  return counts
})

// "My groups" come from /access/users/me; their roles are the caller's own roles.
export const myGroups = computed<Group[]>(() =>
  (userInfo.value?.groups ?? []).map((group) =>
    mapGroup({
      group_id: group.group_id,
      display_name: group.display_name,
      realm_id: realm.value.id,
      roles: group.roles,
    }),
  ),
)

// Realm groups the caller is not a member of, from the open GET /access/groups.
export const discoverableGroups = computed<Group[]>(() => {
  const mine = new Set((userInfo.value?.groups ?? []).map((group) => group.group_id))
  return apiGroups.value.filter((group) => !mine.has(group.group_id)).map(mapGroup)
})

export const groups = myGroups

export function mapGroup(group: ApiGroup): Group {
  return {
    id: group.group_id,
    realmId: group.realm_id,
    name: group.display_name,
    slug: slugify(group.display_name || group.group_id),
    description: roleSummary(group.roles ?? []),
    createdAt: '',
    quotaBytes: 0,
    usedBytes: 0,
    ownerId: '',
    tags: (group.roles ?? []).map((role) => role.name),
    memberCount: groupMemberCounts.value.get(group.group_id),
  }
}

export function memberCount(roles?: ApiRole[]): number | undefined {
  if (!roles?.some((role) => role.assigned_users)) return undefined
  const users = new Set<string>()
  for (const role of roles) for (const user of role.assigned_users ?? []) users.add(user)
  return users.size
}
