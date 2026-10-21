import { describe, expect, it } from 'vitest'
import { closeGate, openGate, pendingGate } from './restoreGate'

describe('restore gate', () => {
  it('holds requests until its own restore ends', async () => {
    const gate = openGate()
    const waiting = pendingGate()
    let released = false
    void waiting?.then(() => (released = true))
    await Promise.resolve()
    expect(released).toBe(false)
    closeGate(gate)
    await Promise.resolve()
    expect(released).toBe(true)
    expect(pendingGate()).toBeNull()
  })

  it('does not let an old restore release the requests of a newer one', async () => {
    const first = openGate()
    const second = openGate()
    const forSecond = pendingGate()
    let released = false
    void forSecond?.then(() => (released = true))
    closeGate(first)
    await Promise.resolve()
    expect(released).toBe(false)
    expect(pendingGate()).toBe(second.promise)
    closeGate(second)
    await Promise.resolve()
    expect(released).toBe(true)
  })

  it('releases the current gate when no gate is named', async () => {
    const gate = openGate()
    closeGate()
    await gate.promise
    expect(pendingGate()).toBeNull()
  })
})
