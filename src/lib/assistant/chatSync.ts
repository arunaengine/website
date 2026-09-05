// What this browser knows about one chat on the node: the head it last saw,
// which local turn sits at which seq, and what still has to be pushed.
import { turnKey, type ChatTurn } from './chatTurns'

export interface ChatSync {
  /** 0 until the node holds the chat. */
  revision: number
  nextSeq: number
  headDirty: boolean
  dirtyTurns: Set<number>
  /** The seq of every turn the node holds, by the turn's key. */
  seqs: Map<string, number>
  /** How often turns were marked; a write that started earlier keeps the mark. */
  changes: number
}

export function newChatSync(): ChatSync {
  return { revision: 0, nextSeq: 0, headDirty: false, dirtyTurns: new Set(), seqs: new Map(), changes: 0 }
}

export function trackHead(sync: ChatSync, head: { revision: number; next_seq: number }) {
  sync.revision = head.revision
  sync.nextSeq = head.next_seq
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

/** Marks the tail turn and every turn after the node's next_seq as unsent. */
export function markTurns(sync: ChatSync, turns: ChatTurn[]) {
  sync.changes += 1
  const seqs = turnSeqs(sync, turns)
  if (!seqs.length) return
  const tail = seqs[seqs.length - 1]
  for (const seq of seqs) if (seq >= Math.min(tail, sync.nextSeq)) sync.dirtyTurns.add(seq)
}

/** Starts the chat over as one the node does not hold. */
export function resetSync(sync: ChatSync, turns: ChatTurn[]) {
  sync.revision = 0
  sync.nextSeq = 0
  sync.seqs.clear()
  sync.dirtyTurns.clear()
  markTurns(sync, turns)
}
