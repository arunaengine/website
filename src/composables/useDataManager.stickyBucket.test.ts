import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  groupSwitchRoute,
  readLastBucket,
  stickyBucketStep,
  stickyScopeFor,
  writeLastBucket,
  type LastBucket,
} from './useDataManager'

const KEY = 'aruna.lastBucket'
const SCOPE = 'https://node-a/api/v1|u-1'
const OTHER = 'https://node-b/api/v1|u-1'

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

let storage: MemoryStorage

function memory(overrides: Partial<LastBucket> = {}): LastBucket {
  return { bucket: 'reef-survey', nodeId: null, groupId: 'g-1', ...overrides }
}

function step(overrides: Record<string, unknown> = {}) {
  return stickyBucketStep({
    memory: memory(),
    groupId: 'g-1',
    buckets: ['reef-survey', 'archive'],
    bucketsLoaded: true,
    ...overrides,
  })
}

beforeEach(() => {
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('sticky bucket memory', () => {
  it('has no scope before the account is known', () => {
    // An early write would land in a scope no signed-in reader looks at.
    expect(stickyScopeFor('http://node/api/v1', undefined)).toBeNull()
    expect(stickyScopeFor('http://node/api/v1', 'user-1')).toBe('http://node/api/v1|user-1')
  })

  it('remembers a bucket for its own connection and account', () => {
    writeLastBucket(SCOPE, memory())

    expect(readLastBucket(SCOPE)).toEqual(memory())
    expect(readLastBucket(OTHER)).toBeNull()
  })

  it('forgets a deleted bucket without touching another scope', () => {
    writeLastBucket(SCOPE, memory())
    writeLastBucket(OTHER, memory({ bucket: 'archive' }))

    writeLastBucket(SCOPE, null)

    expect(readLastBucket(SCOPE)).toBeNull()
    expect(readLastBucket(OTHER)?.bucket).toBe('archive')
  })

  it('survives a stored value it cannot use', () => {
    for (const broken of ['not json', '[]', '{"scope":5}', `{"${SCOPE}":{"nodeId":"node-a"}}`]) {
      storage.setItem(KEY, broken)
      expect(readLastBucket(SCOPE)).toBeNull()
    }

    writeLastBucket(SCOPE, memory())

    expect(readLastBucket(SCOPE)).toEqual(memory())
  })
})

describe('sticky bucket restore', () => {
  it('reopens the remembered bucket on the bucket-less route', () => {
    expect(step()).toEqual({
      action: 'open',
      route: { name: 'bucket', params: { bucketId: 'reef-survey' }, query: { group: 'g-1' } },
    })
  })

  it('waits while the bucket list is still loading', () => {
    expect(step({ bucketsLoaded: false })).toEqual({ action: 'wait' })
    expect(step({ memory: null })).toEqual({ action: 'wait' })
  })

  it('forgets a bucket this group does not have', () => {
    expect(step({ buckets: ['archive'] })).toEqual({ action: 'forget' })
  })

  it('forgets a bucket remembered for another group', () => {
    expect(step({ groupId: 'g-2', buckets: ['reef-survey'] })).toEqual({ action: 'forget' })
  })

  it('forgets a bucket another node serves', () => {
    // Only the connected node's list can confirm a bucket still exists.
    expect(step({ memory: memory({ nodeId: 'node-far' }) })).toEqual({ action: 'forget' })
  })
})

describe('group switch', () => {
  const state = (overrides: Record<string, unknown> = {}) =>
    groupSwitchRoute({
      previous: 'g-1',
      next: 'g-2',
      bucket: 'reef-survey',
      remoteNodeId: null,
      queryGroup: 'g-1',
      notebooks: false,
      ...overrides,
    })

  it('opens the bucket picker for the new group', () => {
    expect(state()).toEqual({ name: 'buckets', query: { group: 'g-2' } })
    expect(state({ notebooks: true })).toEqual({ name: 'buckets', query: { group: 'g-2', notebooks: '1' } })
  })

  it('keeps the route when no bucket is open or the route already names the group', () => {
    expect(state({ bucket: '' })).toBeNull()
    expect(state({ queryGroup: 'g-2' })).toBeNull()
  })

  it('keeps the route for a first group, the same group and remote buckets', () => {
    expect(state({ previous: '' })).toBeNull()
    expect(state({ next: 'g-1' })).toBeNull()
    expect(state({ remoteNodeId: 'node-far' })).toBeNull()
  })
})
