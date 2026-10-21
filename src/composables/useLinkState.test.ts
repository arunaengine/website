import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getImportRenames = vi.fn()
const getOrganizeJob = vi.fn()
const getLinkStatus = vi.fn()
const controlJob = vi.fn()

vi.mock('@/composables/useAruna', () => ({
  isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
  useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t') }),
}))
vi.mock('@/lib/api', () => ({
  getImportRenames: (...args: unknown[]) => getImportRenames(...args),
  getOrganizeJob: (...args: unknown[]) => getOrganizeJob(...args),
  getLinkStatus: (...args: unknown[]) => getLinkStatus(...args),
  controlJob: (...args: unknown[]) => controlJob(...args),
}))

import { useLinkState } from './useLinkState'

const RUNNING = { kind: 'move', state: 'running', done: 1, total: 4, skipped: 0, controls: true }

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

  it('shows a running physical rename without controls', async () => {
    getImportRenames.mockResolvedValue({
      count: 6,
      complete: true,
      files: [],
      progress: { migrated: 4, skipped: 0, failed: 0, started_at_ms: 1 },
    })
    const { scope, state } = setup()
    await state.refresh()
    expect(state.job.value).toMatchObject({ kind: 'rename', done: 4, total: 10, controls: false })
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
