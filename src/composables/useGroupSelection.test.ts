import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const myGroups = ref<Array<{ id: string; name: string }>>([])
const loading = ref(false)
const bootstrapped = ref(true)
const currentUser = ref<{ id: string } | null>({ id: 'u1' })
const loadAuthenticated = vi.fn(async () => undefined)
// Both the window focus and the document visibility listener onWake registers.
let wakeListeners: Array<() => void> = []

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
  wakeListeners = []
  const listen = (_type: string, listener: () => void) => wakeListeners.push(listener)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage, addEventListener: listen, removeEventListener: () => {} },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { hidden: false, addEventListener: listen, removeEventListener: () => {} },
  })
  vi.doMock('./useAruna', () => ({
    useAruna: () => ({ myGroups, loading, bootstrapped, currentUser, loadAuthenticated }),
  }))
  return import('./useGroupSelection')
}

beforeEach(() => {
  myGroups.value = []
  loading.value = false
  bootstrapped.value = true
  currentUser.value = { id: 'u1' }
  loadAuthenticated.mockClear()
})

afterEach(() => {
  vi.doUnmock('./useAruna')
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'document')
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

  it('keeps a plain selection when the active group moves', async () => {
    myGroups.value = [
      { id: 'group-a', name: 'A' },
      { id: 'group-b', name: 'B' },
    ]
    const { useGroupSelection, setActiveGroup } = await loadModule('group-a')
    const selected = ref('')

    useGroupSelection(selected)
    await nextTick()
    setActiveGroup('group-b')
    await nextTick()

    expect(selected.value).toBe('group-a')
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

describe('membership freshness', () => {
  it('reads memberships when a view opens', async () => {
    const { useGroupSelection } = await loadModule()

    useGroupSelection(ref(''))

    expect(loadAuthenticated).toHaveBeenCalledTimes(1)
  })

  it('reads them again when the window comes back', async () => {
    // A group created in another tab is invisible here until they are re-read.
    const { useGroupSelection } = await loadModule()
    useGroupSelection(ref(''))
    await nextTick()
    await nextTick()

    for (const wake of wakeListeners) wake()

    expect(wakeListeners.length).toBeGreaterThan(0)
    expect(loadAuthenticated).toHaveBeenCalledTimes(2)
  })

  it('reads nothing for a signed-out visitor', async () => {
    currentUser.value = null
    const { useGroupSelection } = await loadModule()

    useGroupSelection(ref(''))

    expect(loadAuthenticated).not.toHaveBeenCalled()
  })
})

describe('portal group context', () => {
  it('follows a later switch of the active group', async () => {
    myGroups.value = [
      { id: 'group-a', name: 'A' },
      { id: 'group-b', name: 'B' },
    ]
    const { useGroupContext, setActiveGroup } = await loadModule('group-a')
    const selected = ref('')

    useGroupContext(selected)
    await nextTick()
    expect(selected.value).toBe('group-a')

    setActiveGroup('group-b')
    await nextTick()

    expect(selected.value).toBe('group-b')
  })

  it('keeps a deep link through the first resolution', async () => {
    // The view opened on a group from its route before memberships arrived.
    const { useGroupContext } = await loadModule()
    const selected = ref('group-x')

    useGroupContext(selected)
    myGroups.value = [
      { id: 'group-a', name: 'A' },
      { id: 'group-b', name: 'B' },
    ]
    await nextTick()

    expect(selected.value).toBe('group-x')
  })

  it('ignores a group without a membership', async () => {
    myGroups.value = [{ id: 'group-a', name: 'A' }]
    const { activeGroupId, setActiveGroup } = await loadModule('group-a')

    setActiveGroup('group-z')
    await nextTick()

    expect(activeGroupId.value).toBe('group-a')
    expect(storage.getItem(STORED_KEY)).toBe('group-a')
  })
})
