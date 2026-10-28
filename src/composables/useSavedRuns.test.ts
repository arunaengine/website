import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSavedRuns } from './useSavedRuns'
import type { SavedRun } from '@/lib/savedRuns'

const run: SavedRun = {
  id: 'r1', name: 'Align', savedAt: '2026-10-28T10:00:00Z',
  task: { executors: [{ image: 'alpine', command: ['echo'] }] },
  ask: { inputs: [], results: false },
}

function storage(setItem: (key: string, value: string) => void): Storage {
  return { getItem: () => null, setItem, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 }
}

afterEach(() => vi.unstubAllGlobals())

describe('saved runs store', () => {
  it('keeps the list as stored when this computer refuses to write it, and says why', () => {
    const saved = useSavedRuns()
    vi.stubGlobal('localStorage', storage(() => { throw new Error('QuotaExceededError') }))

    expect(saved.save(run)).toBe(false)
    expect(saved.runs.value).toEqual([])
    expect(saved.failure.value).toContain('QuotaExceededError')

    const written: string[] = []
    vi.stubGlobal('localStorage', storage((_, value) => written.push(value)))
    expect(saved.save(run)).toBe(true)
    expect(saved.runs.value.map((item) => item.id)).toEqual(['r1'])
    expect(saved.failure.value).toBeNull()
    expect(JSON.parse(written[0])[0].id).toBe('r1')
    saved.remove('r1')
  })
})
