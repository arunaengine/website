import { describe, expect, it } from 'vitest'
import { cursorOf, markNew, markTurns, newChatSync, resetSync, restoreCursor, trackHead, turnSeqs } from './chatSync'
import type { ChatTurn } from './chatTurns'

function turn(id: string): ChatTurn {
  return { messages: [{ id, role: 'user', text: id, calls: [], at: 1 }], history: [] }
}

const turns = (...ids: string[]) => ids.map(turn)

/** A sync whose node holds the given turns at seq 0, 1, 2, ... */
function synced(...ids: string[]) {
  const sync = newChatSync()
  ids.forEach((id, seq) => sync.seqs.set(id, seq))
  trackHead(sync, { revision: ids.length, next_seq: ids.length })
  return sync
}

describe('markTurns', () => {
  it('marks every turn of a chat the node does not hold', () => {
    const sync = newChatSync()

    markTurns(sync, turns('u1', 'u2', 'u3'))

    expect([...sync.dirtyTurns]).toEqual([0, 1, 2])
  })

  it('marks only the tail when the node holds every turn', () => {
    const sync = synced('u1', 'u2', 'u3')

    markTurns(sync, turns('u1', 'u2', 'u3'))

    expect([...sync.dirtyTurns]).toEqual([2])
  })

  it('counts new turns on from the node next_seq', () => {
    const sync = synced('u1', 'u2')

    markTurns(sync, turns('u1', 'u2', 'u3', 'u4'))

    expect([...sync.dirtyTurns]).toEqual([2, 3])
    expect(sync.changes).toBe(1)
  })

  it('keeps the seqs when the front of the chat was trimmed', () => {
    // The browser let u1 go; u2 still sits at seq 1 and the new turn at 3.
    const sync = synced('u1', 'u2', 'u3')

    expect(turnSeqs(sync, turns('u2', 'u3', 'u4'))).toEqual([1, 2, 3])
    markTurns(sync, turns('u2', 'u3', 'u4'))
    expect([...sync.dirtyTurns]).toEqual([3])
  })

  it('marks nothing for an empty chat', () => {
    const sync = newChatSync()

    markTurns(sync, [])

    expect(sync.dirtyTurns.size).toBe(0)
  })
})

describe('markNew', () => {
  it('leaves the tail alone and marks only what comes after next_seq', () => {
    const sync = synced('u1', 'u2')

    markNew(sync, turns('u1', 'u2', 'u3'))

    expect([...sync.dirtyTurns]).toEqual([2])
    markNew(sync, turns('u1', 'u2'))
    expect([...sync.dirtyTurns]).toEqual([2])
  })
})

describe('restoreCursor', () => {
  it('places the local turns from the tail key and counts on from next_seq', () => {
    // The browser let u1 go before the reload; u2 and u3 are on the node, u4 is not.
    const sync = newChatSync()

    restoreCursor(sync, turns('u2', 'u3', 'u4'), { revision: 9, nextSeq: 3, tailKey: 'u3' })

    expect(cursorOf(sync)).toEqual({ revision: 9, nextSeq: 3, tailKey: 'u3' })
    expect(turnSeqs(sync, turns('u2', 'u3', 'u4'))).toEqual([1, 2, 3])
  })

  it('leaves the sync empty when the tail turn is gone, so the chat is read in full', () => {
    const sync = newChatSync()

    restoreCursor(sync, turns('u5'), { revision: 9, nextSeq: 3, tailKey: 'u3' })

    expect(sync.revision).toBe(0)
    expect(sync.seqs.size).toBe(0)
  })

  it('takes a cursor for a chat the node holds without turns', () => {
    const sync = newChatSync()

    restoreCursor(sync, turns('u1'), { revision: 1, nextSeq: 0, tailKey: '' })

    expect(sync.revision).toBe(1)
    expect(turnSeqs(sync, turns('u1'))).toEqual([0])
  })
})

describe('resetSync', () => {
  it('starts the chat over from seq 0 with everything unsent', () => {
    const sync = synced('u1', 'u2')
    sync.dirtyTurns.add(1)

    resetSync(sync, turns('u1', 'u2'))

    expect(sync.revision).toBe(0)
    expect(sync.nextSeq).toBe(0)
    expect(sync.seqs.size).toBe(0)
    expect([...sync.dirtyTurns]).toEqual([0, 1])
  })
})
