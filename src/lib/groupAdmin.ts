// Mirrors the backend permission gates for a group. Public roles apply to every
// principal, so they count too.
import type { GroupDetailResponse } from '@/lib/api'

export function hasGroupWrite(
  detail: GroupDetailResponse,
  target: string,
  userId: string,
): boolean {
  return detail.roles.some((role) => {
    if (!(role.public || role.assigned_users?.includes(userId))) return false
    return Object.entries(role.permissions).some(([key, value]) => {
      if (value.toLowerCase() !== 'write') return false
      if (key === target) return true
      if (!key.endsWith('/**')) return false
      const base = key.slice(0, -3)
      return target === base || target.startsWith(`${base}/`)
    })
  })
}

/** The gate group storage, routing and request policies share (ensure_group_admin). */
export function isGroupAdmin(detail: GroupDetailResponse | null, userId: string): boolean {
  if (!detail) return false
  return hasGroupWrite(detail, `/${detail.realm_id}/g/${detail.group_id}/admin/**`, userId)
}
