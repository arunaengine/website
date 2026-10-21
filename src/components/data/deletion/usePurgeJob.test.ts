import { describe, expect, it, vi } from 'vitest'

const controlStoragePurge = vi.fn()
const getStoragePurgeJob = vi.fn()
const startStoragePurge = vi.fn()

vi.mock('@/lib/storageDeletion', async () => {
  const real = await vi.importActual<typeof import('@/lib/storageDeletion')>('@/lib/storageDeletion')
  return {
    ...real,
    controlStoragePurge: (...args: unknown[]) => controlStoragePurge(...args),
    getStoragePurgeJob: (...args: unknown[]) => getStoragePurgeJob(...args),
    startStoragePurge: (...args: unknown[]) => startStoragePurge(...args),
  }
})

import { usePurgeJob } from './usePurgeJob'

const CLIENT = { baseUrl: 'https://api.test', token: 't' }
const running = (extra: object = {}) => ({ kind: 'storage_purge', state: 'running', progress: { current: 1, unit: 'versions' }, ...extra })

describe('usePurgeJob pause', () => {
  it('counts a pause the node accepted until the node says otherwise', async () => {
    startStoragePurge.mockResolvedValue({ job_id: 'j1' })
    controlStoragePurge.mockResolvedValue(undefined)
    getStoragePurgeJob.mockResolvedValueOnce(running())
    let finish: (value: unknown) => void = () => {}
    getStoragePurgeJob.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const job = usePurgeJob()
    const done = job.run({ scope: { kind: 'bucket', bucket: 'b' }, idempotencyKey: 'k' }, CLIENT)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await job.control('pause', CLIENT)
    expect(controlStoragePurge).toHaveBeenCalledWith('j1', 'pause', CLIENT)
    expect(job.paused.value).toBe(true)
    await job.control('resume', CLIENT)
    expect(job.paused.value).toBe(false)
    finish({ ...running({ paused: true }), state: 'succeeded' })
    await done
    expect(job.paused.value).toBe(true)
  })

  it('keeps the pause off when the node refuses it', async () => {
    startStoragePurge.mockResolvedValue({ job_id: 'j2' })
    controlStoragePurge.mockRejectedValue(new Error('no'))
    getStoragePurgeJob.mockReturnValue(new Promise(() => {}))
    const job = usePurgeJob()
    void job.run({ scope: { kind: 'bucket', bucket: 'b' }, idempotencyKey: 'k' }, CLIENT)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(job.control('pause', CLIENT)).rejects.toThrow('no')
    expect(job.paused.value).toBe(false)
  })
})
