import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'
import { ApiError } from '@/lib/api'
import type { SessionCell } from '@/lib/notebook/session'

const listScratch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/notebook/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notebook/session')>()),
  listScratch,
}))

import { SCRATCH_FRESH_MS, useSessionFiles } from './useSessionFiles'

function fakeSession() {
  const jobId = ref('job-a')
  const state = ref<'starting' | 'ready' | 'ended'>('ready')
  const cellStates = ref<Record<string, SessionCell>>({})
  return {
    jobId,
    state,
    cellStates,
    live: computed(() => state.value === 'ready'),
    ended: computed(() => state.value === 'ended'),
    client: computed(() => ({ baseUrl: `https://${jobId.value}.example`, token: 't' })),
  }
}

function listing(path: string, names: string[]) {
  return { path, entries: names.map((name) => ({ name, kind: 'file' as const, bytes: 1, modified_ms: 0 })) }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  listScratch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSessionFiles', () => {
  it('serves a folder from the cache inside the freshness window', async () => {
    const session = fakeSession()
    listScratch.mockResolvedValue(listing('data', ['a.txt']))
    const scope = effectScope()
    const files = scope.run(() => useSessionFiles(session))!
    files.toggle('data')
    await settle()
    expect(files.directory('data')?.entries?.map((entry) => entry.name)).toEqual(['a.txt'])
    files.toggle('data')
    files.toggle('data')
    await settle()
    // One read for the workdir at start, one for data/.
    expect(listScratch).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(SCRATCH_FRESH_MS + 1)
    files.toggle('data')
    files.toggle('data')
    await settle()
    expect(listScratch).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('reads the open folders again once a cell finished', async () => {
    const session = fakeSession()
    listScratch.mockResolvedValue(listing('', ['out.txt']))
    const scope = effectScope()
    const files = scope.run(() => useSessionFiles(session))!
    await files.load('')
    files.toggle('data')
    await settle()
    expect(listScratch).toHaveBeenCalledTimes(2)
    session.cellStates.value = { c1: { cell_id: 'c1', state: 'running' } }
    await settle()
    expect(listScratch).toHaveBeenCalledTimes(2)
    session.cellStates.value = { c1: { cell_id: 'c1', state: 'done' } }
    await settle()
    expect(listScratch).toHaveBeenCalledTimes(4)
    expect(listScratch.mock.calls.slice(2).map((call) => call[1])).toEqual(['', 'data'])
    // The same finished cell reported again is not a new run.
    session.cellStates.value = { c1: { cell_id: 'c1', state: 'done' }, c2: { cell_id: 'c2', state: 'queued' } }
    await settle()
    expect(listScratch).toHaveBeenCalledTimes(4)
    scope.stop()
  })

  it('drops an answer that arrives after the job changed', async () => {
    const session = fakeSession()
    let finish = (_value: unknown) => {}
    listScratch.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const scope = effectScope()
    const files = scope.run(() => useSessionFiles(session))!
    void files.load('')
    expect(files.directory('')?.loading).toBe(true)
    session.jobId.value = 'job-b'
    finish(listing('', ['old.txt']))
    await settle()
    expect(files.directory('')).toBeUndefined()
    expect(files.expanded.value.size).toBe(0)
    scope.stop()
  })

  it('shows a starting kernel apart from an error', async () => {
    const session = fakeSession()
    session.state.value = 'starting'
    listScratch.mockRejectedValueOnce(new ApiError(409, 'starting', 'session_starting'))
    const scope = effectScope()
    const files = scope.run(() => useSessionFiles(session))!
    await settle()
    expect(files.directory('')).toMatchObject({ starting: true, error: null, entries: null })
    listScratch.mockRejectedValueOnce(new ApiError(500, 'helper gone'))
    await files.load('')
    expect(files.directory('')).toMatchObject({ starting: false, error: 'helper gone' })
    // The first live state reads the tree without a click.
    listScratch.mockResolvedValue(listing('', ['ready.txt']))
    session.state.value = 'ready'
    await settle()
    expect(files.directory('')?.entries?.map((entry) => entry.name)).toEqual(['ready.txt'])
    session.state.value = 'ended'
    await settle()
    expect(files.directory('')).toBeUndefined()
    scope.stop()
  })
})
