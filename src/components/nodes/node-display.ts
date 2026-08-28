import type { RealmNodeInfo } from '@/lib/api'
import { stateVariant, toneVariant, type BadgeVariant, type StateTone } from '@/lib/stateBadge'

export type { BadgeVariant }

export const kindVariant: Record<RealmNodeInfo['kind'], BadgeVariant> = {
  management: 'royal',
  server: 'sky',
  user: 'secondary',
}

export function connectionVariant(node: RealmNodeInfo): BadgeVariant {
  // A node without recent contact is a missing signal, not a failure.
  return node.connection_status === 'unknown'
    ? toneVariant('idle')
    : stateVariant(node.connection_status)
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

export function statusTone(status?: string | null): StateTone {
  const value = (status ?? '').toLowerCase()
  if (healthyStatuses.has(value)) return 'done'
  if (degradedStatuses.has(value)) return 'attention'
  if (idleStatuses.has(value)) return 'idle'
  if (failedStatuses.has(value)) return 'failed'
  return 'count'
}

export function statusVariant(status?: string | null): BadgeVariant {
  return toneVariant(statusTone(status))
}

export function isDegradedStatus(status?: string | null): boolean {
  const tone = statusTone(status)
  return tone === 'attention' || tone === 'failed'
}
