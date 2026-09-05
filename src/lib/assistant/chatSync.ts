// What this browser knows about one chat on the node: the head it last saw,
// which local turn sits at which seq, and what still has to be pushed.
import type { AssistantChatCursor } from './chatHistory'
import { turnKey, type ChatTurn } from './chatTurns'

export interface ChatSync {
  /** 0 until the node holds the chat. */
  revision: number
  nextSeq: number
  /** The key of the turn at `nextSeq - 1`. */
  tailKey: string
  headDirty: boolean
  dirtyTurns: Set<number>
  /** The seq of every turn the node holds, by the turn's key. */
  seqs: Map<string, number>
  /** How often turns were marked; a write that started earlier keeps the mark. */
  changes: number
}

export function newChatSync(): ChatSync {
  return { revision: 0, nextSeq: 0, tailKey: '', headDirty: false, dirtyTurns: new Set(), seqs: new Map(), changes: 0 }
}

export function trackHead(sync: ChatSync, head: { revision: number; next_seq: number }) {
  sync.revision = head.revision
  sync.nextSeq = head.next_seq
}

/** The cursor to keep in the local record. */
export function cursorOf(sync: ChatSync): AssistantChatCursor {
  return { revision: sync.revision, nextSeq: sync.nextSeq, tailKey: sync.tailKey }
}

/**
 * Takes up a cursor saved before a reload: the local turn with the tail key
 * sits at `nextSeq - 1` and the ones before it count down from there. When
 * that turn is gone the cursor is left alone, and the chat is read in full.
 */
export function restoreCursor(sync: ChatSync, turns: ChatTurn[], cursor: AssistantChatCursor) {
  if (sync.revision) return
  const at = turns.findIndex((turn) => turnKey(turn) === cursor.tailKey)
  if (at < 0 && cursor.nextSeq > 0) return
  sync.revision = cursor.revision
  sync.nextSeq = cursor.nextSeq
  sync.tailKey = cursor.tailKey
  for (let index = 0; index <= at; index += 1) sync.seqs.set(turnKey(turns[index]), cursor.nextSeq - 1 - at + index)
}

/** The seq of each local turn: known ones as the node has them, the rest counted on from next_seq. */
export function turnSeqs(sync: ChatSync, turns: ChatTurn[]): number[] {
  let last = -1
  turns.forEach((turn, index) => {
    if (sync.seqs.has(turnKey(turn))) last = index
  })
  return turns.map((turn, index) =>
    (index > last ? sync.nextSeq + index - last - 1 : sync.seqs.get(turnKey(turn)) ?? -1))
}

/** Marks the turns after the node's next_seq as unsent. */
export function markNew(sync: ChatSync, turns: ChatTurn[]) {
  for (const seq of turnSeqs(sync, turns)) if (seq >= sync.nextSeq) sync.dirtyTurns.add(seq)
}

/** Marks the tail turn as well, for a chat whose last turn was written to. */
export function markTurns(sync: ChatSync, turns: ChatTurn[]) {
  sync.changes += 1
  markNew(sync, turns)
  const seqs = turnSeqs(sync, turns)
  const tail = seqs[seqs.length - 1]
  if (tail !== undefined && tail >= 0) sync.dirtyTurns.add(tail)
}

/** Starts the chat over as one the node does not hold. */
export function resetSync(sync: ChatSync, turns: ChatTurn[]) {
  sync.revision = 0
  sync.nextSeq = 0
  sync.tailKey = ''
  sync.seqs.clear()
  sync.dirtyTurns.clear()
  markTurns(sync, turns)
}
