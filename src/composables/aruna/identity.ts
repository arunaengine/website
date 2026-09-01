import { computed } from 'vue'
import type { User } from '@/data/types'
import {
  apiRequest,
  type ApiGroup,
  type ListGroupsResponse,
  type ListS3CredentialsResponse,
  type UserInfoResponse,
} from '@/lib/api'
import { colorFor, initials } from './format'
import { profileIdFromPath } from './profileIri'
import { apiGroups, credentials, refreshContext, sessionEpoch, userInfo } from './state'

export async function loadAuthenticated(context = refreshContext()) {
  // /access/users/me is the authentication authority. Optional group and credential
  // capabilities must not turn a valid session into a signed-out one.
  const me = await apiRequest<UserInfoResponse>('/access/users/me', {}, context.client)
  if (context.epoch !== sessionEpoch.value) return
  userInfo.value = me
  const [groups, credentialList] = await Promise.allSettled([
    listGroups(context),
    apiRequest<ListS3CredentialsResponse>('/access/credentials', {}, context.client),
  ])
  if (context.epoch !== sessionEpoch.value) return
  apiGroups.value = groups.status === 'fulfilled' ? groups.value.groups : []
  credentials.value = credentialList.status === 'fulfilled' ? credentialList.value.credentials : []
}

export async function listGroups(context = refreshContext()): Promise<ListGroupsResponse> {
  const groups: ApiGroup[] = []
  const limit = 1000
  let offset = 0
  while (true) {
    const page = await apiRequest<ListGroupsResponse>(
      '/access/groups',
      { query: { include: 'roles', limit, offset } },
      context.client,
    )
    groups.push(...page.groups)
    if (page.groups.length < limit) break
    offset += page.groups.length
  }
  if (context.epoch === sessionEpoch.value) apiGroups.value = groups
  return { groups }
}

export const currentUser = computed<User | null>(() => {
  const user = userInfo.value?.user
  if (!user) return null
  return {
    id: user.user_id,
    name: user.name,
    email: user.attributes.email ?? '',
    orcid: user.attributes.orcid,
    affiliation: user.attributes.affiliation ?? '',
    avatarColor: colorFor(user.user_id),
    initials: initials(user.name),
    preferredProfileId: profileIdFromPath(userInfo.value?.preferences.preferred_profile_path ?? undefined),
    favouriteMetadataIds: userInfo.value?.preferences.favourite_metadata_ids ?? [],
  }
})

// Does a realm role grant `need` on `suffix`, directly or via a /** grant?
// Mirrors the backend's permission matching for /{realm_id}/... admin paths.
export function hasRealmGrant(suffix: string, need: 'Read' | 'Write'): boolean {
  const info = userInfo.value
  if (!info) return false
  const target = `/${info.realm.realm_id}/${suffix}`
  return info.realm.roles.some((role) =>
    Object.entries(role.permissions).some(([key, value]) => {
      if (value !== 'Write' && !(need === 'Read' && value === 'Read')) return false
      if (key === target) return true
      if (!key.endsWith('/**')) return false
      const base = key.slice(0, -3)
      return target === base || target.startsWith(`${base}/`)
    }),
  )
}

// The backend authorizes quota edits with WRITE on exactly /{realm_id}/admin/config.
export const isRealmAdmin = computed<boolean>(() => hasRealmGrant('admin/config', 'Write'))

// The backend gates the user directory on READ of /{realm_id}/admin/u/**
// (operations list_users / get_user); the seeded realm_admin Write grant on
// /{realm_id}/admin/** covers it.
export const canInspectUsers = computed<boolean>(() => hasRealmGrant('admin/u', 'Read'))

// Onboarding admin needs WRITE on /{realm_id}/admin/onboarding, and the
// endpoints only exist on a management node (api/src/routes/onboarding.rs).
export const canManageOnboarding = computed<boolean>(() => hasRealmGrant('admin/onboarding', 'Write'))

// The quarantine console needs WRITE on /{realm_id}/admin/sync-quarantine
// (api/src/routes/sync_quarantine.rs); served by every node, not just management.
export const canManageQuarantine = computed<boolean>(() => hasRealmGrant('admin/sync-quarantine', 'Write'))

// The backend gates PID withdrawal on WRITE of /{realm_id}/admin/pids/{id};
// the seeded realm_admin grant on /{realm_id}/admin/** covers it.
export const canWithdrawPids = computed<boolean>(() => hasRealmGrant('admin/pids', 'Write'))
