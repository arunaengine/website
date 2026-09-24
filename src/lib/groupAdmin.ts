// Mirrors the backend permission gates for a group. Public roles apply to every
// principal, so they count too.
import type { ApiRole, GroupDetailResponse } from '@/lib/api'

function grantsWrite(role: ApiRole, target: string): boolean {
  return Object.entries(role.permissions).some(([key, value]) => {
    if (value.toLowerCase() !== 'write') return false
    if (key === target) return true
    if (!key.endsWith('/**')) return false
    const base = key.slice(0, -3)
    return target === base || target.startsWith(`${base}/`)
  })
}

export function hasGroupWrite(
  detail: GroupDetailResponse,
  target: string,
  userId: string,
): boolean {
  return detail.roles.some((role) => (role.public || role.assigned_users?.includes(userId)) && grantsWrite(role, target))
}

/** WRITE on `target` through the caller's own roles, as /access/users/me lists them. */
export function ownRolesWrite(roles: readonly ApiRole[], target: string): boolean {
  return roles.some((role) => grantsWrite(role, target))
}

/** The gate group storage, routing and request policies share (ensure_group_admin). */
export function isGroupAdmin(detail: GroupDetailResponse | null, userId: string): boolean {
  if (!detail) return false
  return hasGroupWrite(detail, `/${detail.realm_id}/g/${detail.group_id}/admin/**`, userId)
}
