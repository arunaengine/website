import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const myGroups = ref<Array<{ id: string; name: string }>>([])
const loading = ref(false)
const bootstrapped = ref(true)

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const STORED_KEY = 'aruna.lastGroupId'
let storage: MemoryStorage

// The remembered group is read once per module load, so every case starts from
// its own module instance and its own storage.
async function loadModule(stored = '') {
  vi.resetModules()
  storage = new MemoryStorage()
  if (stored) storage.setItem(STORED_KEY, stored)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  })
  vi.doMock('./useAruna', () => ({
    useAruna: () => ({ myGroups, loading, bootstrapped }),
  }))
  return import('./useGroupSelection')
}

beforeEach(() => {
  myGroups.value = []
  loading.value = false
  bootstrapped.value = true
})

afterEach(() => {
  vi.doUnmock('./useAruna')
  Reflect.deleteProperty(globalThis, 'window')
})

describe('shared group selection', () => {
  it('selects the remembered group', async () => {
    myGroups.value = [
      { id: 'group-a', name: 'A' },
      { id: 'group-b', name: 'B' },
    ]
    const { useGroupSelection } = await loadModule('group-b')
    const selected = ref('')

    useGroupSelection(selected)

    expect(selected.value).toBe('group-b')
  })

  it('selects the first group without a remembered one', async () => {
    myGroups.value = [
      { id: 'group-a', name: 'A' },
      { id: 'group-b', name: 'B' },
    ]
    const { useGroupSelection } = await loadModule()
    const selected = ref('')

    useGroupSelection(selected)
    await nextTick()

    expect(selected.value).toBe('group-a')
    expect(storage.getItem(STORED_KEY)).toBe('group-a')
  })

  it('replaces a remembered group that vanished', async () => {
    // The user left the stored group, so the first membership takes over.
    myGroups.value = [{ id: 'group-a', name: 'A' }]
    const { useGroupSelection } = await loadModule('group-gone')
    const selected = ref('')

    useGroupSelection(selected)
    await nextTick()

    expect(selected.value).toBe('group-a')
    expect(storage.getItem(STORED_KEY)).toBe('group-a')
  })

  it('selects nothing without a membership', async () => {
    const { useGroupSelection } = await loadModule('group-a')
    const selected = ref('')

    const { hasGroups, groupsLoading } = useGroupSelection(selected)
    await nextTick()

    expect(selected.value).toBe('')
    expect(hasGroups.value).toBe(false)
    expect(groupsLoading.value).toBe(false)
  })

  it('reports loading until the first bootstrap settles', async () => {
    bootstrapped.value = false
    const { useGroupSelection } = await loadModule('group-b')
    const selected = ref('')

    const { groupsLoading } = useGroupSelection(selected)
    expect(groupsLoading.value).toBe(true)
    expect(selected.value).toBe('')

    myGroups.value = [
      { id: 'group-a', name: 'A' },
      { id: 'group-b', name: 'B' },
    ]
    bootstrapped.value = true
    await nextTick()

    expect(groupsLoading.value).toBe(false)
    expect(selected.value).toBe('group-b')
  })

  it('remembers an explicit switch and keeps it', async () => {
    myGroups.value = [
      { id: 'group-a', name: 'A' },
      { id: 'group-b', name: 'B' },
    ]
    const { useGroupSelection } = await loadModule()
    const selected = ref('')

    useGroupSelection(selected)
    await nextTick()
    selected.value = 'group-b'
    await nextTick()

    expect(storage.getItem(STORED_KEY)).toBe('group-b')
    expect(selected.value).toBe('group-b')
  })
})
