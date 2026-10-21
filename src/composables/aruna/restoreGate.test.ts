import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootstrapGate, closeGate, openGate, pendingGate } from './restoreGate'

afterEach(() => closeGate())

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

  it('keeps requests queued before the first refresh waiting for its restore', async () => {
    const boot = bootstrapGate()
    let released = false
    void pendingGate()?.then(() => (released = true))
    const first = openGate()
    expect(first).toBe(boot)
    await Promise.resolve()
    expect(released).toBe(false)
    closeGate(first)
    await Promise.resolve()
    expect(released).toBe(true)
  })

  it('frees the waiters of a gate that is replaced', async () => {
    const first = openGate()
    let released = false
    void first.promise.then(() => (released = true))
    const second = openGate()
    await Promise.resolve()
    expect(released).toBe(true)
    expect(pendingGate()).toBe(second.promise)
  })

  it('frees the waiters of a gate nobody closes', async () => {
    vi.useFakeTimers()
    try {
      const gate = bootstrapGate()
      let released = false
      void gate.promise.then(() => (released = true))
      await vi.advanceTimersByTimeAsync(16_000)
      expect(released).toBe(true)
      expect(pendingGate()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
