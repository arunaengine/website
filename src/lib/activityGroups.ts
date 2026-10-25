// What the Activity page shows: every transfer of this computer and every
// decision the owner took, grouped by the folder they belong to. Pure, so the
// filters and the counts are the same wherever they are read.
import { folderName, isMoving, type DeviceTransfer, type SyncedFolder } from '@/lib/deviceApi'
import type { Decision } from '@/composables/useFolderDecisions'

export type ActivityFilter = 'all' | 'progress' | 'failed' | 'done' | 'decisions'

export interface ActivityGroup {
  key: string
  name: string
  root: string | null
  rows: DeviceTransfer[]
  decisions: Decision[]
}

export interface ActivityCounts {
  all: number
  progress: number
  failed: number
  done: number
  decisions: number
}

// A failed file stays on top until it is retried; finished ones sink.
const ORDER: Record<DeviceTransfer['state'], number> = {
  failed: 0,
  transferring: 1,
  running: 1,
  retrying: 2,
  queued: 3,
  done: 4,
}

export const OTHER_KEY = 'other'

/** Activity order, then paths compared plainly, the way the node sorts them. */
export function transferOrder(a: DeviceTransfer, b: DeviceTransfer): number {
  return ORDER[a.state] - ORDER[b.state] || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

const inProgress = (transfer: DeviceTransfer) => transfer.state !== 'failed' && transfer.state !== 'done'

export function activityCounts(transfers: readonly DeviceTransfer[], decisions: readonly Decision[]): ActivityCounts {
  return {
    all: transfers.length + decisions.length,
    progress: transfers.filter(inProgress).length,
    failed: transfers.filter((transfer) => transfer.state === 'failed').length,
    done: transfers.filter((transfer) => transfer.state === 'done').length,
    decisions: decisions.length,
  }
}

function keep(filter: ActivityFilter, transfer: DeviceTransfer): boolean {
  switch (filter) {
    case 'progress':
      return inProgress(transfer)
    case 'failed':
      return transfer.state === 'failed'
    case 'done':
      return transfer.state === 'done'
    case 'decisions':
      return false
    default:
      return true
  }
}

/**
 * One group per folder, then one for transfers that belong to none. Under a
 * filter a group with nothing left to show is dropped; under All every folder
 * keeps its card, so an idle folder still reads as idle.
 */
export function groupActivity(
  folders: readonly SyncedFolder[],
  transfers: readonly DeviceTransfer[],
  decisions: readonly Decision[],
  filter: ActivityFilter,
): ActivityGroup[] {
  const known = new Set(folders.map((folder) => folder.folder_id))
  const showDecisions = filter === 'all' || filter === 'decisions'
  const groups: ActivityGroup[] = folders.map((folder) => ({
    key: folder.folder_id,
    name: folderName(folder.root),
    root: folder.root,
    rows: transfers.filter((transfer) => transfer.folder_id === folder.folder_id),
    decisions: decisions.filter((decision) => decision.folderId === folder.folder_id),
  }))
  const loose = transfers.filter((transfer) => !transfer.folder_id || !known.has(transfer.folder_id))
  if (loose.length) groups.push({ key: OTHER_KEY, name: 'Other transfers', root: null, rows: loose, decisions: [] })

  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((transfer) => keep(filter, transfer)).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.path.localeCompare(b.path)),
      decisions: showDecisions ? group.decisions : [],
    }))
    .filter((group) => filter === 'all' || group.rows.length > 0 || group.decisions.length > 0)
}

/** Bytes moved of bytes to move, or null while any open transfer has no counted bytes. */
export function totalProgress(transfers: readonly DeviceTransfer[]): { done: number; total: number } | null {
  const open = transfers.filter((transfer) => isMoving(transfer) || transfer.state === 'queued')
  if (!open.length) return null
  let done = 0
  let total = 0
  for (const transfer of open) {
    if (!transfer.bytes_total) return null
    if (isMoving(transfer) && transfer.bytes_done === null) return null
    done += transfer.bytes_done ?? 0
    total += transfer.bytes_total
  }
  return { done: Math.min(done, total), total }
}
