import type { RealmNodeInfo } from '@/lib/api'

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warn'
  | 'destructive'
  | 'accent'
  | 'royal'
  | 'sky'

export const kindVariant: Record<RealmNodeInfo['kind'], BadgeVariant> = {
  management: 'royal',
  server: 'sky',
  local: 'accent',
  user: 'secondary',
}

export function connectionVariant(node: RealmNodeInfo): BadgeVariant {
  return node.connection_status === 'connected' ? 'success' : 'warn'
}

export function connectionLabel(node: RealmNodeInfo): string {
  return node.connection_status === 'connected' ? 'connected' : 'configured'
}

const healthyStatuses = new Set(['ok', 'running', 'healthy', 'ready', 'up', 'enabled', 'online', 'connected', 'serving', 'active', 'available'])
const degradedStatuses = new Set(['degraded', 'syncing', 'partial', 'known'])
const idleStatuses = new Set(['disabled', 'off', 'stopped', 'inactive', 'not_configured'])
const failedStatuses = new Set(['error', 'failed', 'unhealthy', 'down', 'offline', 'unavailable', 'unreachable'])

export function statusVariant(status?: string | null): BadgeVariant {
  const value = (status ?? '').toLowerCase()
  if (healthyStatuses.has(value)) return 'success'
  if (degradedStatuses.has(value)) return 'warn'
  if (idleStatuses.has(value)) return 'secondary'
  if (failedStatuses.has(value)) return 'destructive'
  return 'outline'
}

export function isDegradedStatus(status?: string | null): boolean {
  const variant = statusVariant(status)
  return variant === 'warn' || variant === 'destructive'
}
