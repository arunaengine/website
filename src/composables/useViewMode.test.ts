import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '@/test/storage'
import { useViewMode } from './useViewMode'

afterEach(() => vi.unstubAllGlobals())

describe('cards or table choice', () => {
  it('starts with cards and remembers a switch per list', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const view = useViewMode('groups')
    expect(view.value).toBe('cards')
    view.value = 'table'
    await nextTick()
    expect(storage.getItem('aruna.view.groups')).toBe('table')
    expect(useViewMode('groups').value).toBe('table')
    expect(useViewMode('datasets').value).toBe('cards')
  })

  it('falls back to cards when storage holds something else or is missing', () => {
    const storage = memoryStorage()
    storage.setItem('aruna.view.groups', 'grid')
    vi.stubGlobal('localStorage', storage)
    expect(useViewMode('groups').value).toBe('cards')
    vi.stubGlobal('localStorage', undefined)
    expect(useViewMode('groups').value).toBe('cards')
  })
})
