import { beforeEach, describe, expect, it, vi } from 'vitest'

const controlStoragePurge = vi.fn()
const getStoragePurgeJob = vi.fn()
const startStoragePurge = vi.fn()
const getStoragePurgeState = vi.fn()

vi.mock('@/lib/storageDeletion', async () => {
  const real = await vi.importActual<typeof import('@/lib/storageDeletion')>('@/lib/storageDeletion')
  return {
    ...real,
    controlStoragePurge: (...args: unknown[]) => controlStoragePurge(...args),
    getStoragePurgeJob: (...args: unknown[]) => getStoragePurgeJob(...args),
    startStoragePurge: (...args: unknown[]) => startStoragePurge(...args),
    getStoragePurgeState: (...args: unknown[]) => getStoragePurgeState(...args),
  }
})

import { usePurgeJob } from './usePurgeJob'

const CLIENT = { baseUrl: 'https://api.test', token: 't' }
const running = (extra: object = {}) => ({ kind: 'storage_purge', state: 'running', progress: { current: 1, unit: 'versions' }, ...extra })

describe('usePurgeJob pause', () => {
  beforeEach(() => {
    getStoragePurgeState.mockReset().mockRejectedValue({ status: 404 })
  })

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

  it('takes the pause from the answer of the node', async () => {
    startStoragePurge.mockResolvedValue({ job_id: 'j3' })
    controlStoragePurge.mockReset().mockResolvedValue({ job_id: 'j3', state: 'running', paused: false, delete_storage_files: true })
    getStoragePurgeJob.mockReturnValue(new Promise(() => {}))
    const job = usePurgeJob()
    void job.run({ scope: { kind: 'bucket', bucket: 'b' }, idempotencyKey: 'k' }, CLIENT)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await job.control('pause', CLIENT)
    expect(job.paused.value).toBe(false)
    controlStoragePurge.mockResolvedValue({ job_id: 'j3', state: 'paused', paused: true, delete_storage_files: true })
    await job.control('pause', CLIENT)
    expect(job.paused.value).toBe(true)
  })

  it('reads the pause from the state route while polling, and stops asking a node without it', async () => {
    startStoragePurge.mockResolvedValue({ job_id: 'j4' })
    getStoragePurgeJob.mockReset().mockResolvedValueOnce(running()).mockResolvedValueOnce({ ...running(), state: 'succeeded' })
    getStoragePurgeState.mockReset().mockResolvedValue({ job_id: 'j4', state: 'paused', paused: true, delete_storage_files: true })
    const job = usePurgeJob()
    await job.run({ scope: { kind: 'bucket', bucket: 'b' }, idempotencyKey: 'k' }, CLIENT)
    expect(getStoragePurgeState).toHaveBeenCalledWith('j4', CLIENT)
    expect(job.paused.value).toBe(true)

    getStoragePurgeState.mockReset().mockRejectedValue({ status: 404 })
    getStoragePurgeJob.mockReset().mockResolvedValueOnce(running()).mockResolvedValueOnce(running()).mockResolvedValueOnce({ ...running(), state: 'succeeded' })
    await job.run({ scope: { kind: 'bucket', bucket: 'b' }, idempotencyKey: 'k2' }, CLIENT)
    expect(getStoragePurgeState).toHaveBeenCalledTimes(1)
  })
})
