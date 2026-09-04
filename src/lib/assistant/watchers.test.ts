import { describe, expect, it, vi } from 'vitest'
import type { AssistantChatStorage } from './chatHistory'
import {
  MAX_ASSISTANT_WATCHES,
  MAX_WATCH_ERRORS,
  WATCH_DEADLINE_MS,
  WATCH_FIRST_DELAY_MS,
  WATCH_MAX_DELAY_MS,
  createWatchRegistry,
  createWatchStore,
  jobOutcome,
  syncOutcome,
  watchDelay,
  type AssistantWatch,
  type WatchPoll,
  type WatchRegistryOptions,
} from './watchers'

const scope = { apiBaseUrl: 'https://api.example.test', realmId: 'realm-a', userId: 'user-a' }

function storage(): AssistantChatStorage & { values: Map<string, string> } {
  return {
    values: new Map<string, string>(),
    getItem(key) {
      return this.values.get(key) ?? null
    },
    setItem(key, value) {
      this.values.set(key, value)
    },
  }
}

function watch(overrides: Partial<AssistantWatch> = {}): AssistantWatch {
  return {
    id: 'chat-a|job|01JOB',
    chatId: 'chat-a',
    kind: 'job',
    target: '01JOB',
    label: 'GC content',
    createdAt: 1_000,
    deadlineAt: 1_000 + WATCH_DEADLINE_MS,
    nextPollAt: 1_000,
    attempts: 0,
    errors: 0,
    ...overrides,
  }
}

interface Harness {
  registry: ReturnType<typeof createWatchRegistry>
  resumed: Array<{ chatId: string; text: string }>
  saved: AssistantWatch[][]
  clock: { value: number }
}

function harness(options: Partial<WatchRegistryOptions> = {}): Harness {
  const resumed: Array<{ chatId: string; text: string }> = []
  const saved: AssistantWatch[][] = []
  const clock = { value: 1_000 }
  const registry = createWatchRegistry({
    now: () => clock.value,
    poll: async () => ({ state: 'pending' }),
    resume: (chatId, text) => {
      resumed.push({ chatId, text })
    },
    hasChat: () => true,
    load: () => [],
    save: (watches) => {
      saved.push(watches.map((entry) => ({ ...entry })))
    },
    ...options,
  })
  return { registry, resumed, saved, clock }
}

describe('watchDelay', () => {
  it('grows from the first delay up to the cap', () => {
    expect(watchDelay(0)).toBe(WATCH_FIRST_DELAY_MS)
    expect(watchDelay(1)).toBeGreaterThan(WATCH_FIRST_DELAY_MS)
    expect(watchDelay(50)).toBe(WATCH_MAX_DELAY_MS)
  })
})

describe('jobOutcome', () => {
  it('keeps waiting through every in-flight state', () => {
    for (const state of ['queued', 'claimed', 'preparing', 'ready', 'running', 'cancelling', 'indeterminate']) {
      expect(jobOutcome(watch(), state).state).toBe('pending')
    }
  })

  it('finishes on each settled state', () => {
    for (const state of ['succeeded', 'failed', 'cancelled']) {
      const outcome = jobOutcome(watch(), state)
      expect(outcome.state).toBe('final')
      if (outcome.state === 'final') expect(outcome.text).toContain(state)
    }
  })
})

describe('syncOutcome', () => {
  const relationship = watch({ kind: 'sync', target: 'sync-1', id: 'chat-a|sync|sync-1' })

  it('records a baseline on the first poll of a running sync', () => {
    const outcome = syncOutcome(relationship, { state: 'enabled', pendingJobs: 3 })
    expect(outcome).toEqual({ state: 'pending', seen: 'enabled|3||' })
  })

  it('finishes once nothing is queued and it synced since the watch began', () => {
    const first = syncOutcome(relationship, { state: 'enabled', pendingJobs: 2 })
    const seen = first.state === 'pending' ? first.seen : undefined
    const outcome = syncOutcome(
      { ...relationship, seen },
      { state: 'enabled', pendingJobs: 0, lastSyncedAt: new Date(5_000).toISOString() },
    )
    expect(outcome.state).toBe('final')
  })

  it('ignores a sync that last ran before the watch began', () => {
    const outcome = syncOutcome(
      { ...relationship, seen: 'enabled|1||' },
      { state: 'enabled', pendingJobs: 0, lastSyncedAt: new Date(500).toISOString() },
    )
    expect(outcome.state).toBe('pending')
  })

  it('reports a failed relationship', () => {
    expect(syncOutcome(relationship, { state: 'failed', pendingJobs: 0 }).state).toBe('final')
  })

  it('says nothing while the snapshot is unchanged', () => {
    expect(syncOutcome({ ...relationship, seen: 'enabled|1||' }, { state: 'enabled', pendingJobs: 1 }))
      .toEqual({ state: 'pending' })
  })
})

describe('watch registry', () => {
  it('registers a watch and polls it once it is due', async () => {
    const polled: string[] = []
    const { registry, clock, resumed } = harness({
      poll: async (entry) => {
        polled.push(entry.target)
        return { state: 'final', text: `done ${entry.target}` }
      },
    })

    expect(registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' }).ok).toBe(true)
    await registry.tick()
    expect(polled).toEqual([])

    clock.value += WATCH_FIRST_DELAY_MS
    await registry.tick()

    expect(polled).toEqual(['01JOB'])
    expect(resumed).toEqual([{ chatId: 'chat-a', text: 'done 01JOB' }])
    expect(registry.list()).toEqual([])
  })

  it('backs off while the work is still in flight', async () => {
    const { registry, clock } = harness({ poll: async () => ({ state: 'pending' }) as WatchPoll })
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' })

    clock.value += WATCH_FIRST_DELAY_MS
    await registry.tick()
    const first = registry.list()[0].nextPollAt
    clock.value = first
    await registry.tick()
    const second = registry.list()[0].nextPollAt

    expect(first - 1_000).toBeGreaterThanOrEqual(WATCH_FIRST_DELAY_MS)
    expect(second - first).toBeGreaterThan(watchDelay(0))
  })

  it('refuses more than the cap', () => {
    const { registry } = harness()
    for (let index = 0; index < MAX_ASSISTANT_WATCHES; index += 1) {
      expect(registry.add({ chatId: 'chat-a', kind: 'job', target: `job-${index}`, label: 'run' }).ok).toBe(true)
    }

    const refused = registry.add({ chatId: 'chat-a', kind: 'job', target: 'one-too-many', label: 'run' })

    expect(refused.ok).toBe(false)
    expect(registry.list()).toHaveLength(MAX_ASSISTANT_WATCHES)
  })

  it('watches the same target once per chat', () => {
    const { registry } = harness()
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' })
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run again' })
    registry.add({ chatId: 'chat-b', kind: 'job', target: '01JOB', label: 'run' })

    expect(registry.list()).toHaveLength(2)
  })

  it('stops at the hard deadline instead of polling forever', async () => {
    const poll = vi.fn(async () => ({ state: 'pending' }) as WatchPoll)
    const { registry, clock, resumed } = harness({ poll })
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' })

    clock.value += WATCH_DEADLINE_MS + 1
    await registry.tick()

    expect(poll).not.toHaveBeenCalled()
    expect(registry.list()).toEqual([])
    expect(resumed[0].text).toContain('stopped watching')
  })

  it('gives up after repeated read failures', async () => {
    const { registry, clock, resumed } = harness({
      poll: async () => {
        throw new Error('403')
      },
    })
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' })

    for (let attempt = 0; attempt < MAX_WATCH_ERRORS; attempt += 1) {
      clock.value = registry.list()[0]?.nextPollAt ?? clock.value
      await registry.tick()
    }

    expect(registry.list()).toEqual([])
    expect(resumed).toHaveLength(1)
    expect(resumed[0].text).toContain('could not be read')
  })

  it('drops the watches of a chat that is gone', async () => {
    const { registry, resumed } = harness({ hasChat: (chatId) => chatId === 'chat-b' })
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' })
    registry.add({ chatId: 'chat-b', kind: 'job', target: '02JOB', label: 'run' })

    registry.dropChat('chat-a')

    expect(registry.list().map((entry) => entry.chatId)).toEqual(['chat-b'])
    await registry.tick()
    expect(resumed).toEqual([])
  })

  it('forgets a chat deleted behind its back on the next tick', async () => {
    const { registry } = harness({ hasChat: () => false })
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' })

    await registry.tick()

    expect(registry.list()).toEqual([])
  })

  it('clears every watch at once', () => {
    const { registry, saved } = harness()
    registry.add({ chatId: 'chat-a', kind: 'job', target: '01JOB', label: 'run' })

    registry.clear()

    expect(registry.list()).toEqual([])
    expect(saved.at(-1)).toEqual([])
  })
})

describe('watch store', () => {
  it('round-trips pending watches and unread counts', () => {
    const cell = storage()
    const store = createWatchStore(scope, cell)
    store.save({ watches: [watch()], unread: { 'chat-a': 2 } })

    const loaded = createWatchStore(scope, cell).load(2_000)

    expect(loaded.watches).toHaveLength(1)
    expect(loaded.watches[0]).toMatchObject({ chatId: 'chat-a', kind: 'job', target: '01JOB' })
    expect(loaded.unread).toEqual({ 'chat-a': 2 })
  })

  it('resumes a reloaded watch shortly after startup', () => {
    const cell = storage()
    createWatchStore(scope, cell).save({ watches: [watch({ attempts: 9, nextPollAt: 1_000 })], unread: {} })

    const [reloaded] = createWatchStore(scope, cell).load(50_000).watches

    expect(reloaded.nextPollAt).toBe(50_000 + WATCH_FIRST_DELAY_MS)
  })

  it('drops a watch whose deadline passed while the tab was closed', () => {
    const cell = storage()
    createWatchStore(scope, cell).save({ watches: [watch()], unread: {} })

    expect(createWatchStore(scope, cell).load(1_000 + WATCH_DEADLINE_MS + 1).watches).toEqual([])
  })

  it('keeps each scope apart', () => {
    const cell = storage()
    createWatchStore(scope, cell).save({ watches: [watch()], unread: {} })

    const other = createWatchStore({ ...scope, userId: 'user-b' }, cell).load(2_000)

    expect(other.watches).toEqual([])
  })

  it('survives unreadable stored bytes', () => {
    const cell = storage()
    const store = createWatchStore(scope, cell)
    cell.values.set(store.key, '{ not json')

    expect(store.load()).toEqual({ watches: [], unread: {} })
  })

  it('hands a reloaded registry its pending watches', async () => {
    const cell = storage()
    createWatchStore(scope, cell).save({ watches: [watch()], unread: {} })
    const store = createWatchStore(scope, cell)
    const payload = store.load(2_000)
    const { registry, clock, resumed } = harness({
      load: () => payload.watches,
      poll: async () => ({ state: 'final', text: 'the job finished' }),
    })

    clock.value = payload.watches[0].nextPollAt
    await registry.tick()

    expect(resumed).toEqual([{ chatId: 'chat-a', text: 'the job finished' }])
  })
})
