import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const KEY = 'aruna.objectSearchMode'
let storage: Map<string, string>

// The stored mode is read once per module load, so every case needs its own
// module instance and its own storage.
async function loadModule(stored?: string) {
  vi.resetModules()
  storage = new Map()
  if (stored !== undefined) storage.set(KEY, stored)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  })
  const module = await import('./useSearchSettings')
  return module.useSearchSettings()
}

describe('object search mode setting', () => {
  it('falls back on an unknown value', async () => {
    const { objectSearchMode } = await loadModule('teleported')
    expect(objectSearchMode.value).toBe('distributed_best_effort')
  })

  it('starts on nothing stored', async () => {
    const { objectSearchMode } = await loadModule()
    expect(objectSearchMode.value).toBe('distributed_best_effort')
  })

  it('restores a stored mode', async () => {
    const { objectSearchMode } = await loadModule('distributed_strict')
    expect(objectSearchMode.value).toBe('distributed_strict')
  })

  it('persists the picked mode', async () => {
    const { objectSearchMode } = await loadModule()
    objectSearchMode.value = 'local'
    await nextTick()
    expect(storage.get(KEY)).toBe('local')
  })
})
