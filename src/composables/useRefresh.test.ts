import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_REFRESH_SPIN_MS, useRefresh } from './useRefresh'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useRefresh', () => {
  it('keeps an instant refresh visible', async () => {
    const { busy, refresh } = useRefresh(() => Promise.resolve())

    const pending = refresh()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS - 1)
    expect(busy.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(busy.value).toBe(false)
  })

  it('stays busy while slow work runs', async () => {
    const { busy, refresh } = useRefresh(() => new Promise((resolve) => setTimeout(resolve, 900)))

    const pending = refresh()
    await vi.advanceTimersByTimeAsync(899)
    expect(busy.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(busy.value).toBe(false)
  })

  it('ignores a click while one refresh runs', async () => {
    const run = vi.fn(() => Promise.resolve())
    const { refresh } = useRefresh(run)

    const pending = refresh()
    await refresh()
    expect(run).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS)
    await pending

    const second = refresh()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS)
    await second
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('reports a failure and still clears', async () => {
    const failure = new Error('offline')
    const onError = vi.fn()
    const { busy, refresh } = useRefresh(() => Promise.reject(failure), onError)

    const pending = refresh()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS)
    await pending

    expect(onError).toHaveBeenCalledWith(failure)
    expect(busy.value).toBe(false)
  })
})
