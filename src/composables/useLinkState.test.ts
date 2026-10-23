import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getImportRenames = vi.fn()
const getOrganizeJob = vi.fn()
const getLinkStatus = vi.fn()
const controlJob = vi.fn()
const { MockApiError } = vi.hoisted(() => ({
  MockApiError: class extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message)
    }
  },
}))
const ApiError = MockApiError

vi.mock('@/composables/useAruna', () => ({
  isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
  useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t') }),
}))
vi.mock('@/lib/api', () => ({
  getImportRenames: (...args: unknown[]) => getImportRenames(...args),
  getOrganizeJob: (...args: unknown[]) => getOrganizeJob(...args),
  getLinkStatus: (...args: unknown[]) => getLinkStatus(...args),
  controlJob: (...args: unknown[]) => controlJob(...args),
  ApiError: MockApiError,
}))

import { useLinkState } from './useLinkState'

const RUNNING = { kind: 'move', state: 'running', done: 1, total: 4, counted: true, skipped: 0, failed: 0, started_at_ms: 1, controls: true }

function setup() {
  const scope = effectScope()
  const state = scope.run(() => useLinkState(() => 'g1', () => 'i1'))!
  return { scope, state }
}

beforeEach(() => {
  getImportRenames.mockReset().mockResolvedValue({ count: 0, complete: true, files: [] })
  getOrganizeJob.mockReset().mockResolvedValue(null)
  getLinkStatus.mockReset().mockResolvedValue({ conflicts: [] })
  controlJob.mockReset()
})

describe('useLinkState', () => {
  it('turns off the step controls when the node answers 404', async () => {
    getOrganizeJob.mockRejectedValue({ status: 404 })
    getLinkStatus.mockRejectedValue({ status: 404 })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.supported.value).toBe(false)
    expect(state.error.value).toBeNull()
    expect(state.status.value).toBeNull()
    scope.stop()
  })

  it('shows the running step and sends a control', async () => {
    getOrganizeJob.mockResolvedValue(RUNNING)
    controlJob.mockResolvedValue({ ...RUNNING, state: 'paused' })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.job.value).toMatchObject({ kind: 'move', state: 'running' })
    getOrganizeJob.mockResolvedValue({ ...RUNNING, state: 'paused' })
    await state.control('pause')
    expect(controlJob).toHaveBeenCalledWith('g1', 'i1', 'pause', expect.anything())
    expect(state.job.value?.state).toBe('paused')
    scope.stop()
  })

  it('shows a rename from an older node as a count only, never a guessed total', async () => {
    getImportRenames.mockResolvedValue({ count: 6, complete: true, files: [] })
    getOrganizeJob.mockResolvedValue({ ...RUNNING, kind: 'rename', total: 0, counted: false, done: 400 })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.job.value).toMatchObject({ kind: 'rename', done: 400, total: 0, counted: false })
    expect(state.job.value?.left).toBeUndefined()
    scope.stop()
  })

  it('does not take a lower bound for the total of a rename', async () => {
    getOrganizeJob.mockResolvedValue({ ...RUNNING, kind: 'rename', total: 50, counted: false, done: 400 })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.job.value).toMatchObject({ total: 0 })
    scope.stop()
  })

  it('shows nothing once a step is over', async () => {
    getOrganizeJob.mockResolvedValue({ ...RUNNING, state: 'done' })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.job.value).toBeNull()
    scope.stop()
  })

  it('does not call a step that ended meanwhile an error', async () => {
    controlJob.mockRejectedValue(Object.assign(new ApiError(409, 'none', 'no_job')))
    const { scope, state } = setup()
    await state.control('pause')
    expect(state.error.value).toBeNull()
    scope.stop()
  })

  it('keeps an error of a failed control', async () => {
    controlJob.mockRejectedValue(new Error('refused'))
    const { scope, state } = setup()
    await state.control('abort')
    expect(state.error.value).toBe('refused')
    scope.stop()
  })

  it('keeps the running step when a poll fails and shows the error', async () => {
    getOrganizeJob.mockResolvedValue(RUNNING)
    const { scope, state } = setup()
    await state.refresh()
    getOrganizeJob.mockRejectedValue(new Error('offline'))
    await state.refresh()
    expect(state.job.value).toMatchObject({ kind: 'move', state: 'running' })
    expect(state.error.value).toBe('offline')
    getOrganizeJob.mockResolvedValue(RUNNING)
    await state.refresh()
    expect(state.error.value).toBeNull()
    scope.stop()
  })

  it('does not poll again after it is disposed, even with a control pending', async () => {
    vi.useFakeTimers()
    try {
      getOrganizeJob.mockResolvedValue(RUNNING)
      let answer: (value: unknown) => void = () => {}
      controlJob.mockReturnValue(new Promise((resolve) => (answer = resolve)))
      const { scope, state } = setup()
      await state.refresh()
      const pending = state.control('pause')
      scope.stop()
      answer({ ...RUNNING, state: 'paused' })
      await pending
      const calls = getOrganizeJob.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(getOrganizeJob.mock.calls.length).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts a step that ended, once, even if it was never seen running', async () => {
    getOrganizeJob.mockResolvedValue({ ...RUNNING, state: 'done', finished_at_ms: 5 })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.finished.value).toBe(1)
    await state.refresh()
    expect(state.finished.value).toBe(1)
    getOrganizeJob.mockResolvedValue({ ...RUNNING, state: 'done', started_at_ms: 9, finished_at_ms: 12 })
    await state.refresh()
    expect(state.finished.value).toBe(2)
    scope.stop()
  })

  it('reads only the progress while a step runs', async () => {
    getOrganizeJob.mockResolvedValue(RUNNING)
    const { scope, state } = setup()
    await state.refresh()
    expect(getImportRenames).toHaveBeenCalledTimes(1)
    await state.refresh()
    expect(getImportRenames).toHaveBeenCalledTimes(1)
    expect(getLinkStatus).toHaveBeenCalledTimes(1)
    getImportRenames.mockResolvedValue({ count: 3, complete: true, files: [] })
    getOrganizeJob.mockResolvedValue({ ...RUNNING, state: 'done', finished_at_ms: 5 })
    await state.refresh()
    expect(getImportRenames).toHaveBeenCalledTimes(2)
    expect(getLinkStatus).toHaveBeenCalledTimes(2)
    expect(state.renames.value?.count).toBe(3)
    scope.stop()
  })

  it('shows the total the node reports for a rename', async () => {
    getOrganizeJob.mockResolvedValue({ ...RUNNING, kind: 'rename', total: 3877, counted: true, done: 152, started_at_ms: 100 })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.job.value).toMatchObject({ kind: 'rename', done: 152, total: 3877, counted: true })
    scope.stop()
  })

  it('tells the time left of a rename from the node total and the speed since it started', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(10 * 60_000)
      const rename = { ...RUNNING, kind: 'rename', total: 3877, counted: true, done: 152, started_at_ms: 0 }
      getOrganizeJob.mockResolvedValue(rename)
      const { scope, state } = setup()
      await state.refresh()
      expect(state.job.value?.left).toBe('about 4 h left')
      getOrganizeJob.mockResolvedValue({ ...rename, state: 'paused' })
      await state.refresh()
      expect(state.job.value?.left).toBeNull()
      scope.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the last step once it is over', async () => {
    getOrganizeJob.mockResolvedValue(RUNNING)
    const { scope, state } = setup()
    await state.refresh()
    expect(state.lastJob.value).toBeNull()
    getOrganizeJob.mockResolvedValue({ ...RUNNING, state: 'done', finished_at_ms: 5 })
    await state.refresh()
    expect(state.job.value).toBeNull()
    expect(state.lastJob.value).toMatchObject({ kind: 'move', state: 'done' })
    scope.stop()
  })

  describe('a rename just accepted', () => {
    const STEP = { ...RUNNING, kind: 'rename', total: 0, counted: false, done: 20, started_at_ms: 100 }

    it('runs at once as starting, before any read answers, and reads no plan', async () => {
      getOrganizeJob.mockReturnValue(new Promise(() => {}))
      const { scope, state } = setup()
      void state.begin()
      expect(state.job.value).toMatchObject({ kind: 'rename', state: 'running', controls: false, starting: true, done: 0 })
      expect(getImportRenames).not.toHaveBeenCalled()
      scope.stop()
    })

    it('takes the real step once a read shows it', async () => {
      getOrganizeJob.mockResolvedValue({ ...STEP, total: 3877, counted: true })
      const { scope, state } = setup()
      await state.begin()
      expect(state.job.value).toMatchObject({ done: 20, total: 3877, controls: true })
      expect(state.job.value?.starting).toBeUndefined()
      scope.stop()
    })

    it('stays running through a read that does not show the step yet', async () => {
      vi.useFakeTimers()
      try {
        getOrganizeJob.mockResolvedValue(null)
        const { scope, state } = setup()
        await state.begin()
        expect(state.job.value).toMatchObject({ kind: 'rename', controls: false })
        getOrganizeJob.mockResolvedValue(STEP)
        await vi.advanceTimersByTimeAsync(3000)
        expect(state.job.value).toMatchObject({ done: 20, controls: true })
        scope.stop()
      } finally {
        vi.useRealTimers()
      }
    })

    it('stays running when only an older finished step is shown', async () => {
      const older = { ...RUNNING, kind: 'rename', state: 'done', started_at_ms: 5, finished_at_ms: 6 }
      getOrganizeJob.mockResolvedValue(older)
      const { scope, state } = setup()
      await state.refresh()
      await state.begin()
      expect(state.job.value).toMatchObject({ kind: 'rename', controls: false })
      getOrganizeJob.mockResolvedValue({ ...older, started_at_ms: 9, finished_at_ms: 12 })
      await state.refresh()
      expect(state.job.value).toBeNull()
      expect(state.lastJob.value).toMatchObject({ started_at_ms: 9 })
      scope.stop()
    })

    it('ends when no read ever shows the step, and reads the counts again', async () => {
      vi.useFakeTimers()
      try {
        getOrganizeJob.mockResolvedValue(null)
        const { scope, state } = setup()
        await state.begin()
        await vi.advanceTimersByTimeAsync(3000)
        expect(state.job.value).toBeNull()
        expect(state.finished.value).toBe(1)
        expect(getImportRenames).toHaveBeenCalled()
        scope.stop()
      } finally {
        vi.useRealTimers()
      }
    })

    it('stays running when a read fails', async () => {
      getOrganizeJob.mockRejectedValue(new Error('offline'))
      const { scope, state } = setup()
      await state.begin()
      expect(state.job.value).toMatchObject({ kind: 'rename' })
      expect(state.error.value).toBe('offline')
      scope.stop()
    })
  })

  it('counts a running step that vanished', async () => {
    getOrganizeJob.mockResolvedValue(RUNNING)
    const { scope, state } = setup()
    await state.refresh()
    getOrganizeJob.mockResolvedValue(null)
    await state.refresh()
    expect(state.finished.value).toBe(1)
    scope.stop()
  })
})
