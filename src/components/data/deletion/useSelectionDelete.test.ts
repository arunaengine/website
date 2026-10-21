import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const startStoragePurge = vi.fn()
const getStoragePurgeJob = vi.fn()
const getStorageDeletionPreflight = vi.fn()
const controlStoragePurge = vi.fn()

vi.mock('@/composables/useS3', () => ({
  isS3NetworkError: () => false,
  s3ErrorMessage: String,
  useS3: () => ({}),
}))
vi.mock('@/lib/storageDeletion', async () => {
  const real = await vi.importActual<typeof import('@/lib/storageDeletion')>('@/lib/storageDeletion')
  return {
    ...real,
    startStoragePurge: (...args: unknown[]) => startStoragePurge(...args),
    getStoragePurgeJob: (...args: unknown[]) => getStoragePurgeJob(...args),
    getStorageDeletionPreflight: (...args: unknown[]) => getStorageDeletionPreflight(...args),
    controlStoragePurge: (...args: unknown[]) => controlStoragePurge(...args),
  }
})

import { MAX_SELECTION_PURGE, useSelectionDelete } from './useSelectionDelete'

const CLIENT = { baseUrl: 'https://api.test', token: 't' }
const OPEN = { permissions: { purge: true }, counts: { complete: true } }

describe('selection purge', () => {
  it('deletes the storage files of every selected file and folder', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockImplementation(async (operation: { scope: { key?: string; prefix?: string } }) => ({
      job_id: operation.scope.key ?? operation.scope.prefix,
    }))
    getStoragePurgeJob.mockResolvedValue({ kind: 'storage_purge', state: 'succeeded' })
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a.txt'], prefixes: ['raw/'] }, CLIENT)
    const ids = ['a.txt', 'raw/']
    expect(selection.purgeReady(ids)).toBe(true)
    await selection.purgeKeys(ids, CLIENT, ids)

    expect(startStoragePurge).toHaveBeenCalledTimes(2)
    for (const [operation] of startStoragePurge.mock.calls) expect(operation.deleteStorageFiles).toBe(true)
    expect(selection.outcome.value?.committed).toEqual(ids)
  })

  it('refuses a selection of more entries than it will start jobs for', () => {
    const selection = useSelectionDelete()
    const ids = Array.from({ length: MAX_SELECTION_PURGE + 1 }, (_, index) => `k${index}`)
    expect(selection.purgeReady(ids)).toBe(false)
  })

  it('records each entry as its job ends', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockImplementation(async (operation: { scope: { key: string } }) => ({ job_id: operation.scope.key }))
    getStoragePurgeJob.mockImplementation(async (id: string) =>
      id === 'bad' ? { kind: 'storage_purge', state: 'failed', error: { message: 'refused' } } : { kind: 'storage_purge', state: 'succeeded' },
    )
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['good', 'bad'], prefixes: [] }, CLIENT)
    await selection.purgeKeys(['good', 'bad'], CLIENT, ['good', 'bad'])
    expect(selection.outcome.value?.committed).toEqual(['good'])
    expect(selection.outcome.value?.failed).toEqual([{ key: 'bad', message: 'refused' }])
  })

  it('pauses, resumes and aborts every job that is still running', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockImplementation(async (operation: { scope: { key: string } }) => ({ job_id: operation.scope.key }))
    controlStoragePurge.mockReset().mockResolvedValue(undefined)
    let finish: (value: unknown) => void = () => {}
    getStoragePurgeJob.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a', 'b'], prefixes: [] }, CLIENT)
    const running = selection.purgeKeys(['a', 'b'], CLIENT, ['a', 'b'])
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await selection.controlAll('pause', CLIENT)
    expect(controlStoragePurge.mock.calls.map((call) => [call[0], call[1]])).toEqual([['a', 'pause'], ['b', 'pause']])
    expect(selection.paused.value).toBe(true)
    await selection.controlAll('resume', CLIENT)
    expect(selection.paused.value).toBe(false)
    finish({ kind: 'storage_purge', state: 'succeeded' })
    await running
    controlStoragePurge.mockClear()
    await selection.controlAll('abort', CLIENT)
    expect(controlStoragePurge).not.toHaveBeenCalled()
  })

  it('reports a refused control and keeps the pause state', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockImplementation(async (operation: { scope: { key: string } }) => ({ job_id: operation.scope.key }))
    controlStoragePurge.mockReset().mockRejectedValue(new Error('refused'))
    getStoragePurgeJob.mockReturnValue(new Promise(() => {}))
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a'], prefixes: [] }, CLIENT)
    void selection.purgeKeys(['a'], CLIENT, ['a'])
    await new Promise((resolve) => setTimeout(resolve, 0))
    await selection.controlAll('pause', CLIENT)
    expect(selection.controlError.value).toBe('refused')
    expect(selection.paused.value).toBe(false)
  })

  const later = () => new Promise((resolve) => setTimeout(resolve, 0))
  const jobFor = async (operation: { scope: { key: string } }) => ({ job_id: operation.scope.key })

  it('offers no controls until every start request has settled', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    controlStoragePurge.mockReset().mockResolvedValue(undefined)
    let acceptB: (value: unknown) => void = () => {}
    startStoragePurge.mockImplementation((operation: { scope: { key: string } }) =>
      operation.scope.key === 'b' ? new Promise((resolve) => (acceptB = resolve)) : jobFor(operation),
    )
    getStoragePurgeJob.mockReset().mockReturnValue(new Promise(() => {}))
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a', 'b'], prefixes: [] }, CLIENT)
    void selection.purgeKeys(['a', 'b'], CLIENT, ['a', 'b'])
    await later()
    expect(selection.starting.value).toBe(true)
    await selection.controlAll('abort', CLIENT)
    expect(controlStoragePurge).not.toHaveBeenCalled()
    acceptB({ job_id: 'b' })
    await later()
    expect(selection.starting.value).toBe(false)
    await selection.controlAll('abort', CLIENT)
    expect(controlStoragePurge.mock.calls.map((call) => [call[0], call[1]])).toEqual([['a', 'abort'], ['b', 'abort']])
  })

  it('keeps Resume for the jobs a partial pause reached and the refusal as a control error', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockImplementation(jobFor)
    controlStoragePurge.mockReset().mockImplementation(async (jobId: string, action: string) => {
      if (jobId === 'b' && action === 'pause') throw new Error('refused')
    })
    getStoragePurgeJob.mockReset().mockReturnValue(new Promise(() => {}))
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a', 'b'], prefixes: [] }, CLIENT)
    void selection.purgeKeys(['a', 'b'], CLIENT, ['a', 'b'])
    await later()
    await selection.controlAll('pause', CLIENT)
    expect(selection.controlError.value).toBe('refused')
    expect(selection.paused.value).toBe(true)
    controlStoragePurge.mockClear()
    await selection.controlAll('resume', CLIENT)
    expect(controlStoragePurge.mock.calls.map((call) => [call[0], call[1]])).toEqual([['a', 'resume']])
    expect(selection.paused.value).toBe(false)
    expect(selection.controlError.value).toBeNull()
  })

  it('keeps a control refusal when a later poll works', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockImplementation(jobFor)
    controlStoragePurge.mockReset().mockRejectedValue(new Error('abort refused'))
    getStoragePurgeJob.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ kind: 'storage_purge', state: 'running' })
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a'], prefixes: [] }, CLIENT)
    void selection.purgeKeys(['a'], CLIENT, ['a'])
    await later()
    expect(selection.pollError.value).toBe('offline')
    await selection.controlAll('abort', CLIENT)
    expect(selection.controlError.value).toBe('abort refused')
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(selection.pollError.value).toBeNull()
    expect(selection.controlError.value).toBe('abort refused')
  })

  it('keeps the controls and shows the error when a poll fails', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockResolvedValue({ job_id: 'a' })
    controlStoragePurge.mockReset().mockResolvedValue(undefined)
    getStoragePurgeJob.mockReset().mockRejectedValueOnce(new Error('offline')).mockReturnValue(new Promise(() => {}))
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a'], prefixes: [] }, CLIENT)
    void selection.purgeKeys(['a'], CLIENT, ['a'])
    await later()
    expect(selection.pollError.value).toBe('offline')
    expect(selection.outcome.value).toBeNull()
    await selection.controlAll('abort', CLIENT)
    expect(controlStoragePurge).toHaveBeenCalledWith('a', 'abort', CLIENT)
  })

  it('stops polling when it is disposed', async () => {
    vi.useFakeTimers()
    try {
      getStorageDeletionPreflight.mockResolvedValue(OPEN)
      startStoragePurge.mockResolvedValue({ job_id: 'a' })
      getStoragePurgeJob.mockReset().mockRejectedValue(new Error('offline'))
      const scope = effectScope()
      const selection = scope.run(() => useSelectionDelete())!
      await selection.loadScopes('reef', { keys: ['a'], prefixes: [] }, CLIENT)
      const running = selection.purgeKeys(['a'], CLIENT, ['a'])
      await vi.advanceTimersByTimeAsync(2500)
      const calls = getStoragePurgeJob.mock.calls.length
      expect(calls).toBeGreaterThan(1)
      scope.stop()
      await vi.advanceTimersByTimeAsync(5000)
      await running
      expect(getStoragePurgeJob.mock.calls.length).toBeLessThanOrEqual(calls + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts clean for a retry after an abort', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockReset().mockImplementation(jobFor)
    controlStoragePurge.mockReset().mockResolvedValue(undefined)
    getStoragePurgeJob.mockReset().mockResolvedValueOnce({ kind: 'storage_purge', state: 'running' })
    getStoragePurgeJob.mockResolvedValue({ kind: 'storage_purge', state: 'cancelled' })
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a'], prefixes: [] }, CLIENT)
    const first = selection.purgeKeys(['a'], CLIENT, ['a'])
    await later()
    await selection.controlAll('abort', CLIENT)
    await first
    expect(selection.outcome.value?.failed).toHaveLength(1)

    getStoragePurgeJob.mockReset().mockResolvedValue({ kind: 'storage_purge', state: 'succeeded' })
    await selection.purgeKeys(['a'], CLIENT, ['a'])
    expect(startStoragePurge).toHaveBeenCalledTimes(2)
    expect(selection.outcome.value?.committed).toEqual(['a'])
    expect(selection.controlError.value).toBeNull()
    expect(selection.starting.value).toBe(false)
  })

  it('ignores a start answer of an earlier run', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    controlStoragePurge.mockReset().mockResolvedValue(undefined)
    getStoragePurgeJob.mockReset().mockReturnValue(new Promise(() => {}))
    let oldStart: (value: unknown) => void = () => {}
    startStoragePurge.mockReset().mockReturnValueOnce(new Promise((resolve) => (oldStart = resolve)))
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a', 'b'], prefixes: [] }, CLIENT)
    void selection.purgeKeys(['a'], CLIENT, ['a', 'b'])
    await later()

    let newStart: (value: unknown) => void = () => {}
    startStoragePurge.mockReturnValueOnce(new Promise((resolve) => (newStart = resolve)))
    void selection.purgeKeys(['b'], CLIENT, ['a', 'b'])
    await later()
    expect(selection.starting.value).toBe(true)

    oldStart({ job_id: 'a' })
    await later()
    // The old answer must not count against the new run, so Abort is still withheld.
    expect(selection.starting.value).toBe(true)
    await selection.controlAll('abort', CLIENT)
    expect(controlStoragePurge).not.toHaveBeenCalled()

    newStart({ job_id: 'b' })
    await later()
    expect(selection.starting.value).toBe(false)
    await selection.controlAll('abort', CLIENT)
    expect(controlStoragePurge.mock.calls.map((call) => call[0])).toEqual(['b'])
  })

  it('retries a cancelled deletion with a new key and an uncertain one with the same key', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockReset().mockImplementation(jobFor)
    getStoragePurgeJob.mockReset().mockResolvedValue({ kind: 'storage_purge', state: 'cancelled' })
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a'], prefixes: [] }, CLIENT)
    await selection.purgeKeys(['a'], CLIENT, ['a'])
    await selection.purgeKeys(['a'], CLIENT, ['a'])
    const [first, second] = startStoragePurge.mock.calls.map((call) => call[0].idempotencyKey)
    expect(second).not.toBe(first)

    startStoragePurge.mockReset().mockRejectedValue(new Error('network'))
    await selection.purgeKeys(['a'], CLIENT, ['a'])
    await selection.purgeKeys(['a'], CLIENT, ['a'])
    const [third, fourth] = startStoragePurge.mock.calls.map((call) => call[0].idempotencyKey)
    expect(fourth).toBe(third)
  })

  it('ignores a control answer and a poll answer of an earlier run', async () => {
    getStorageDeletionPreflight.mockResolvedValue(OPEN)
    startStoragePurge.mockReset().mockImplementation(jobFor)
    let oldPoll: (reason: unknown) => void = () => {}
    getStoragePurgeJob.mockReset().mockReturnValueOnce(new Promise((_, reject) => (oldPoll = reject)))
    let oldControl: (value: unknown) => void = () => {}
    controlStoragePurge.mockReset().mockReturnValueOnce(new Promise((resolve) => (oldControl = resolve)))
    const selection = useSelectionDelete()
    await selection.loadScopes('reef', { keys: ['a'], prefixes: [] }, CLIENT)
    void selection.purgeKeys(['a'], CLIENT, ['a'])
    await later()
    const pausing = selection.controlAll('pause', CLIENT)

    getStoragePurgeJob.mockReturnValue(new Promise(() => {}))
    void selection.purgeKeys(['a'], CLIENT, ['a'])
    await later()
    oldControl(undefined)
    oldPoll(new Error('old poll'))
    await pausing
    await later()
    expect(selection.paused.value).toBe(false)
    expect(selection.pollError.value).toBeNull()
    expect(selection.controlError.value).toBeNull()
  })
})
