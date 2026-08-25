// How a synced-folder entry is worded and ordered for its owner. Local data
// wins by default, so the states that wait for a decision are named as such and
// sort to the top; nothing here ever describes an automatic overwrite.
import type { BadgeVariant } from '@/components/nodes/node-display'
import type { EntryState, FolderEntry } from './deviceApi'

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

const TONE_ORDER: Record<EntryTone, number> = { decide: 0, error: 1, moving: 2, settled: 3 }

/** Decisions first, then work in flight, then the quiet files. */
export function orderEntries(entries: FolderEntry[]): FolderEntry[] {
  return [...entries].sort((a, b) => {
    const byTone = TONE_ORDER[entryMeta(a.state).tone] - TONE_ORDER[entryMeta(b.state).tone]
    return byTone !== 0 ? byTone : a.path.localeCompare(b.path)
  })
}

const TONE_BADGE: Record<EntryTone, BadgeVariant> = {
  settled: 'secondary',
  moving: 'sky',
  decide: 'warn',
  error: 'destructive',
}

export function entryBadge(state: EntryState): BadgeVariant {
  return TONE_BADGE[entryMeta(state).tone]
}
