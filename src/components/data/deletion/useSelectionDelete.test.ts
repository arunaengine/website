import { describe, expect, it, vi } from 'vitest'

const startStoragePurge = vi.fn()
const getStoragePurgeJob = vi.fn()
const getStorageDeletionPreflight = vi.fn()

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
})
