import type { RealmNodeInfo } from '@/lib/api'
import { stateVariant, toneVariant, type BadgeVariant, type StateTone } from '@/lib/stateBadge'
import { nodeApiBase } from './node-probe'
import { formatCount } from '@/lib/formatCount'

/** Whether a node is online: a realm node by its presence, a device by its recent contact. */
export function nodeOnline(node: Pick<RealmNodeInfo, 'kind' | 'present' | 'connection_status'>): boolean {
  return node.kind === 'user' ? node.connection_status === 'connected' || node.connection_status === 'seen' : node.present
}

/** The node's role for people: management, storage or device. */
export const roleLabel: Record<RealmNodeInfo['kind'], string> = { management: 'management', server: 'storage', user: 'device' }

/** What a node's last heartbeat says it runs, imports first as they explain a busy node; null when idle. */
export function nodeActivity(node: Pick<RealmNodeInfo, 'info'>): string | null {
  const utilization = node.info?.utilization
  const jobs = (count: number) => `${formatCount(count)} ${count === 1 ? 'job' : 'jobs'}`
  if (utilization?.imports_running) return `Importing, ${jobs(utilization.imports_running)}`
  if (utilization?.jobs_running) return `Busy, ${jobs(utilization.jobs_running)}`
  return null
}

const jobLabels: Record<string, string> = {
  import_rocrate: 'Importing records',
  export_rocrate: 'Exporting a dataset',
  staging: 'Importing files',
  copy_object: 'Copying data',
  storage_purge: 'Removing deleted data',
  execution: 'Running a workflow',
  probe: 'Checking the node',
  backend_import: 'Importing storage files',
  harvest: 'Harvesting records',
  write_run_crate: 'Writing run record',
  register_identifiers: 'Registering identifiers',
  mint_persistent_id: 'Creating a persistent ID',
  terminal_cleanup: 'Cleaning up a run',
}

/** A running job's kind for people; an unknown kind reads as its wire name in words. */
export function jobLabel(kind: string): string {
  return jobLabels[kind] ?? kind.replace(/_/g, ' ')
}

/** The name a node was given: the realm's display name, then its name labels; null without one. */
export function givenName(node: Pick<RealmNodeInfo, 'display_name' | 'info'>): string | null {
  const labels = node.info?.labels ?? {}
  return node.display_name || labels['name'] || labels['display_name'] || labels['device'] || null
}

/**
 * A node's name for people: the realm's display name, then its own name labels, then the first part
 * of its API host ("api.node-2.example.org" is "node-2"). Never its id.
 */
export function nodeName(node: Pick<RealmNodeInfo, 'kind' | 'display_name' | 'info' | 'rest_url'>): string {
  const named = givenName(node)
  if (named) return named
  let host = ''
  try {
    host = new URL(nodeApiBase(node as RealmNodeInfo) ?? '').hostname
  } catch {
    // No address published yet.
  }
  if (/^[\d.]+$|:/.test(host)) return host
  const parts = host.split('.').filter(Boolean)
  return (parts[0] === 'api' ? parts[1] : parts[0]) || (node.kind === 'user' ? 'Device' : 'Unnamed node')
}

const PEER_ID = /\b[0-9a-f]{64}\b/

/** The node a warning is about, by the peer id it names; null when it names none. */
export function warningPeer(text: string): string | null {
  return text.match(PEER_ID)?.[0] ?? null
}

/** A node warning for people: a peer id reads as its node's name, the raw text is kept for a hint. */
export function readableWarning(text: string, name: (nodeId: string) => string): { text: string; raw?: string } {
  const id = text.match(PEER_ID)?.[0]
  if (!id) return { text }
  const head = (text.split(': ')[0] ?? text).replace(/^(managed )?peer\s+/i, '').replace(id, name(id))
  return { text: head.replace(/\s+unreachable$/, ' is unreachable'), raw: text }
}

export type { BadgeVariant }

export const kindVariant: Record<RealmNodeInfo['kind'], BadgeVariant> = {
  management: 'royal',
  server: 'sky',
  user: 'secondary',
}

/** Display names for the wire node kinds; the wire values stay untranslated. */
export const kindLabel: Record<RealmNodeInfo['kind'], string> = {
  management: 'management',
  server: 'server',
  user: 'device',
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

/**
 * A status as one plain word, only when it is not fine ("not configured", "degraded"); null when
 * all is well, so nothing needs to be said. `failed` tells a failure from a lesser problem.
 */
export function statusProblem(status?: string | null): { word: string; failed: boolean } | null {
  const tone = statusTone(status)
  if (tone === 'done') return null
  return { word: (status || 'unknown').replace(/_/g, ' '), failed: tone === 'failed' }
}

export function statusVariant(status?: string | null): BadgeVariant {
  return toneVariant(statusTone(status))
}

export function isDegradedStatus(status?: string | null): boolean {
  const tone = statusTone(status)
  return tone === 'attention' || tone === 'failed'
}
