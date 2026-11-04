import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTimers } from './timers'

afterEach(() => {
  vi.useRealTimers()
})

describe('landing timers', () => {
  it('runs pending work in order and drops it once cleared', async () => {
    vi.useFakeTimers()
    const timers = createTimers()
    const seen: string[] = []
    timers.after(200, () => seen.push('late'))
    void timers.wait(100).then(() => seen.push('waited'))

    await vi.advanceTimersByTimeAsync(150)
    expect(seen).toEqual(['waited'])

    timers.clear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(seen).toEqual(['waited'])
  })
})
