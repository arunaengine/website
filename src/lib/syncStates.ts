// How a synced-folder entry is worded and ordered for its owner. Local data
// wins by default, so the states that wait for a decision are named as such and
// sort to the top; nothing here ever describes an automatic overwrite.
import type { BadgeVariant } from '@/components/nodes/node-display'
import { stateVariant, toneVariant, type StateTone } from './stateBadge'
import {
  folderName,
  isMoving,
  type ActionRecord,
  type DeviceTransfer,
  type DocumentSyncState,
  type EntryState,
  type FolderCounters,
  type FolderEntry,
  type FolderMode,
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
  if (folder.state === 'binding') {
    if (!folder.last_error) return { label: 'Linking', variant: toneVariant('progress') }
    return { label: 'Linking', variant: toneVariant('attention'), detail: folder.last_error }
  }

  const folderTransfers = item.transfers?.filter((transfer) => transfer.folder_id === folder.folder_id) ?? []
  const failedTransfer = folderTransfers.find((transfer) => transfer.state === 'failed')
  const failedMessage = folderTransfers.find((transfer) => transfer.state === 'failed' && transfer.message)?.message
  const errorDetail = folder.last_error ?? item.actionError ?? failedMessage ?? undefined
  if (folder.state === 'error' || folder.counters.errors > 0 || errorDetail || failedTransfer) {
    return { label: 'Error', variant: toneVariant('failed'), ...(errorDetail ? { detail: errorDetail } : {}) }
  }

  const needsYou = needsYouCount(folder.counters)
  if (needsYou) {
    return { label: `${needsYou} ${needsYou === 1 ? 'file needs' : 'files need'} you`, variant: toneVariant('attention') }
  }

  const activeTransfers = folderTransfers.filter((transfer) => transfer.state === 'queued' || isMoving(transfer))
  // Read transfers are live; the folder counter is only as fresh as the last folder read.
  const syncing = item.transfers ? activeTransfers.length : folder.counters.uploading
  if (syncing) {
    const receiving = item.transfers !== undefined && activeTransfers.every((transfer) => transfer.direction === 'download')
    const noun = syncing === 1 ? 'file' : 'files'
    return { label: `${receiving ? 'Receiving' : 'Sending'} ${syncing} ${noun}`, variant: toneVariant('progress') }
  }

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
  in_sync: { label: 'Synced', tone: 'settled', hint: 'Same on this computer and in Aruna.' },
  local_new: { label: 'Waiting', tone: 'moving', hint: 'Waiting to be sent to Aruna.' },
  local_changed: { label: 'Waiting', tone: 'moving', hint: 'Your edit is on its way to Aruna.' },
  remote_new: { label: 'Receiving', tone: 'moving', hint: 'Coming from Aruna into this folder.' },
  remote_changed: {
    label: 'Receiving',
    tone: 'moving',
    hint: 'Your copy is unchanged since the last sync, so the new Aruna version can be saved here.',
  },
  conflict: {
    label: 'Both changed',
    tone: 'decide',
    hint: 'Your file was kept and the Aruna version sits beside it as a copy. Nothing was replaced.',
  },
  pending_replace: {
    label: 'Waiting for you',
    tone: 'decide',
    hint: 'The Aruna version only takes its place if you say so.',
  },
  remote_deleted: {
    label: 'Deleted in Aruna',
    tone: 'decide',
    hint: 'Your file is still here. Removing it is your call.',
  },
  local_deleted: { label: 'Deleted here', tone: 'moving', hint: 'Aruna keeps a delete marker.' },
  error: { label: 'Failed', tone: 'error', hint: 'The last try on this file failed.' },
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

/** Decisions first, then work in flight, then the quiet files; a file in flight leads its group. */
export function orderEntries(entries: FolderEntry[], moving?: { has(path: string): boolean }): FolderEntry[] {
  return [...entries].sort((a, b) => {
    const byTone = TONE_ORDER[entryMeta(a.state).tone] - TONE_ORDER[entryMeta(b.state).tone]
    const byMoving = Number(moving?.has(b.path) ?? false) - Number(moving?.has(a.path) ?? false)
    return byTone || byMoving || a.path.localeCompare(b.path)
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

export type DecisionOutcome = 'applied' | 'stale' | 'failed'

export interface DecisionLine {
  text: string
  outcome: DecisionOutcome
}

// What a choice is called before it happens: "use the Aruna version of".
const VERB: Record<string, [done: string, tried: string, after?: string]> = {
  keep_local: ['Kept your version of', 'keep your version of'],
  replace_local: ['Used the Aruna version of', 'use the Aruna version of'],
  remove_local: ['Moved your copy of', 'move your copy of', 'to the Trash'],
  resolve: ['Marked', 'mark', 'as handled'],
}

function phrase(parts: [string, string, string?] | undefined, file: string, tried: boolean): string | null {
  if (!parts) return null
  const tail = parts[2] ? ` ${parts[2]}` : ''
  return `${tried ? parts[1] : parts[0]} ${file}${tail}`
}

/**
 * One plain line for a decision the owner took, or null for one it cannot word.
 * A refused or failed choice is told as such, never as a success.
 */
export function decisionLine(record: ActionRecord): DecisionLine | null {
  const file = record.scope === 'all_pending' ? 'all waiting files' : (record.path ?? 'a file')
  const verb = VERB[record.action]
  // A node that records no outcome says only that the choice was taken.
  const outcome = record.outcome ?? 'applied'
  if (outcome === 'applied') {
    const text = phrase(verb, file, false)
    return text ? { text, outcome } : null
  }
  const tried = phrase(verb, file, true)
  if (!tried) return null
  if (outcome === 'stale') {
    return { text: `Did not ${tried}: the file changed again first`, outcome }
  }
  if (outcome === 'failed') {
    return { text: `Could not ${tried}${record.message ? `: ${record.message}` : ''}`, outcome }
  }
  return null
}

/** The line alone, for callers that only show text. */
export function decisionText(record: ActionRecord): string | null {
  return decisionLine(record)?.text ?? null
}

/** What a transfer is doing, in the words the owner reads. */
export function transferLabel(transfer: DeviceTransfer): string {
  switch (transfer.state) {
    case 'queued':
      return 'Waiting'
    case 'running':
    case 'transferring':
      return transfer.direction === 'upload' ? 'Sending' : 'Receiving'
    case 'retrying':
      return 'Retrying'
    case 'failed':
      return 'Failed'
    default:
      return 'Done'
  }
}

/** How far a transfer got, or null while that is not known. */
export function transferPercent(transfer: DeviceTransfer): number | null {
  if (transfer.state === 'done') return 100
  if (transfer.state === 'queued') return 0
  if (!isMoving(transfer)) return null
  if (!transfer.bytes_total || transfer.bytes_done === null) return null
  return Math.min(100, Math.floor((transfer.bytes_done / transfer.bytes_total) * 100))
}

/** How a folder works, as a short label. */
export function modeLabel(mode: FolderMode): string {
  return mode === 'upload_only' ? 'Send to Aruna' : mode === 'download_only' ? 'Keep a copy' : 'Both ways'
}

/** How a folder works, as the end of a sentence. */
export function modePhrase(mode: FolderMode): string {
  if (mode === 'upload_only') return 'sending to Aruna'
  return mode === 'download_only' ? 'keeping a copy on this computer' : 'both ways'
}
