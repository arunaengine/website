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
  user: 'secondary',
}

export function connectionVariant(node: RealmNodeInfo): BadgeVariant {
  if (node.connection_status === 'connected' || node.connection_status === 'seen') return 'success'
  // A device without recent contact is a missing signal, not a failure.
  return node.connection_status === 'unknown' ? 'secondary' : 'warn'
}

export function connectionLabel(node: RealmNodeInfo): string {
  switch (node.connection_status) {
    case 'connected':
      return 'connected'
    case 'seen':
      return 'active'
    case 'unknown':
      return 'no recent contact'
    default:
      return 'configured'
  }
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
