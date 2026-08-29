// How a synced-folder entry is worded and ordered for its owner. Local data
// wins by default, so the states that wait for a decision are named as such and
// sort to the top; nothing here ever describes an automatic overwrite.
import type { BadgeVariant } from '@/components/nodes/node-display'
import { stateVariant, toneVariant, type StateTone } from './stateBadge'
import {
  folderName,
  type DeviceTransfer,
  type DocumentSyncState,
  type EntryState,
  type FolderCounters,
  type FolderEntry,
  type SyncedFolder,
  type SyncDocument,
} from './deviceApi'

export interface ItemChip {
  label: string
  variant: BadgeVariant
  detail?: string
}

export type SyncItem =
  | {
      kind: 'folder'
      folder: SyncedFolder
      actionError?: string | null
      transfers?: readonly DeviceTransfer[]
    }
  | { kind: 'document'; document: SyncDocument }

const DOCUMENT_LABEL: Record<DocumentSyncState, string> = {
  synced: 'In sync',
  pending: 'Pending',
  publishing: 'Publishing',
  invalid: 'Invalid',
  failed: 'Error',
  local_only: 'Local only',
}

function documentDetail(document: SyncDocument): string | undefined {
  if (document.state !== 'invalid' && document.state !== 'failed') return undefined
  if (document.lastError) return document.lastError
  const noun = document.validationFindings === 1 ? 'validation finding' : 'validation findings'
  return `${document.validationFindings} ${noun}; the last valid version is shown until this is fixed`
}

export function itemChip(item: SyncItem): ItemChip {
  if (item.kind === 'document') {
    const detail = documentDetail(item.document)
    return {
      label: DOCUMENT_LABEL[item.document.state],
      variant: stateVariant(item.document.state),
      ...(detail ? { detail } : {}),
    }
  }

  const { folder } = item
  if (folder.state === 'paused') return { label: 'Paused', variant: toneVariant('idle') }
  if (folder.state === 'deleting') return { label: 'Deleting', variant: toneVariant('progress') }

  const folderTransfers = item.transfers?.filter((transfer) => transfer.folder_id === folder.folder_id) ?? []
  const failedTransfer = folderTransfers.find((transfer) => transfer.state === 'failed')
  const failedMessage = folderTransfers.find((transfer) => transfer.state === 'failed' && transfer.message)?.message
  const errorDetail = folder.last_error ?? item.actionError ?? failedMessage ?? undefined
  if (folder.state === 'error' || folder.counters.errors > 0 || errorDetail || failedTransfer) {
    return { label: 'Error', variant: toneVariant('failed'), ...(errorDetail ? { detail: errorDetail } : {}) }
  }

  const needsYou = needsYouCount(folder.counters)
  if (needsYou) return { label: `Needs you ${needsYou}`, variant: toneVariant('attention') }

  const activeTransfers = folderTransfers.filter(
    (transfer) => transfer.state === 'queued' || transfer.state === 'running',
  ).length
  const syncing = folder.counters.uploading || activeTransfers
  if (syncing) return { label: `Syncing ${syncing}`, variant: toneVariant('progress') }

  return {
    label: 'In sync',
    variant: toneVariant('done'),
    detail: folder.last_reconcile_ms === null ? 'Never checked' : undefined,
  }
}

export type EntryTone = 'settled' | 'moving' | 'decide' | 'error'

export interface EntryMeta {
  label: string
  tone: EntryTone
  hint: string
}

export const ENTRY_META: Record<EntryState, EntryMeta> = {
  in_sync: { label: 'In sync', tone: 'settled', hint: 'The same bytes here and in the realm.' },
  local_new: { label: 'New here', tone: 'moving', hint: 'Queued for upload to the realm.' },
  local_changed: { label: 'Changed here', tone: 'moving', hint: 'Your edit becomes the next realm version.' },
  remote_new: { label: 'New in the realm', tone: 'moving', hint: 'Being written into this folder.' },
  remote_changed: {
    label: 'Updated in the realm',
    tone: 'moving',
    hint: 'Your copy is unchanged since the last sync, so it can be updated safely.',
  },
  conflict: {
    label: 'Both changed',
    tone: 'decide',
    hint: 'Your file was kept and the realm version sits beside it as a conflicted copy.',
  },
  pending_replace: {
    label: 'Waiting for you',
    tone: 'decide',
    hint: 'The realm version can only take its place if you say so.',
  },
  remote_deleted: {
    label: 'Deleted in the realm',
    tone: 'decide',
    hint: 'Your file is still here. Removing it is your call.',
  },
  local_deleted: { label: 'Deleted here', tone: 'moving', hint: 'The realm gets a delete marker.' },
  error: { label: 'Error', tone: 'error', hint: 'The last attempt on this file failed.' },
}

export function entryMeta(state: EntryState): EntryMeta {
  return ENTRY_META[state] ?? ENTRY_META.error
}

// The three states the sync will not move past on its own. An entry in error
// is counted apart: it failed, it is not waiting on a decision.
const NEEDS_YOU: readonly EntryState[] = ['conflict', 'pending_replace', 'remote_deleted']

/** True while the entry waits for the owner rather than for the sync. */
export function entryNeedsYou(state: EntryState): boolean {
  return NEEDS_YOU.includes(state)
}

/** How many files in a folder are waiting for the owner. */
export function needsYouCount(counters: FolderCounters): number {
  return counters.conflicts + counters.pending_replacements + counters.remote_deleted
}

/** The subset a folder-wide replace covers; a removal stays per file. */
export function replaceableCount(counters: FolderCounters): number {
  return counters.conflicts + counters.pending_replacements
}

const TONE_ORDER: Record<EntryTone, number> = { decide: 0, error: 1, moving: 2, settled: 3 }

/** Decisions first, then work in flight, then the quiet files. */
export function orderEntries(entries: FolderEntry[]): FolderEntry[] {
  return [...entries].sort((a, b) => {
    const byTone = TONE_ORDER[entryMeta(a.state).tone] - TONE_ORDER[entryMeta(b.state).tone]
    return byTone !== 0 ? byTone : a.path.localeCompare(b.path)
  })
}

const ENTRY_STATE_TONE: Record<EntryTone, StateTone> = {
  settled: 'idle',
  moving: 'progress',
  decide: 'attention',
  error: 'failed',
}

export function entryBadge(state: EntryState): BadgeVariant {
  return toneVariant(ENTRY_STATE_TONE[entryMeta(state).tone])
}

/**
 * Arms a folder-wide replacement of local files. Giving up many copies at once
 * takes the folder's own name, typed exactly; nothing else counts.
 */
export function folderConfirmed(root: string, typed: string): boolean {
  const name = folderName(root)
  return name.length > 0 && typed.trim() === name
}
