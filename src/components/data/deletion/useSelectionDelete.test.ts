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
    await expect(selection.controlAll('pause', CLIENT)).rejects.toThrow('refused')
    expect(selection.paused.value).toBe(false)
  })
})
