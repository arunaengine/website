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

  it('shows a running rename that reports no total', async () => {
    getOrganizeJob.mockResolvedValue({ ...RUNNING, kind: 'rename', total: 0, counted: false, done: 4 })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.job.value).toMatchObject({ kind: 'rename', done: 4, total: 0 })
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
})
