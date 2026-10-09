import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { GRANT_HEADER, transferHeader } from '@/lib/api/federation'

const createExport = vi.fn()
const createGrant = vi.fn()
const getJob = vi.fn()

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  createExport: (...args: unknown[]) => createExport(...args),
  createGrant: (...args: unknown[]) => createGrant(...args),
}))
vi.mock('@/lib/jobs', async (original) => ({
  ...(await original<typeof import('@/lib/jobs')>()),
  getJob: (...args: unknown[]) => getJob(...args),
}))

const { artifactBytes, exportFailure, exportForIntent, waitForJob } = await import('./useSourceExport')

const source = { descriptor: { payload: {} }, intent: { payload: {} }, client: { baseUrl: '/api/v1', token: 'A' } } as never

beforeEach(() => {
  for (const mock of [createExport, createGrant, getJob]) mock.mockReset()
})

describe('exportForIntent', () => {
  it('signs the grant only after the export succeeded', async () => {
    createExport.mockResolvedValue({ job_id: 'J' })
    getJob.mockResolvedValueOnce({ state: 'running' }).mockResolvedValueOnce({ state: 'succeeded' })
    createGrant.mockResolvedValue({ payload: { export_job_id: 'J' } })
    vi.useFakeTimers()
    const done = exportForIntent(source, 'DOC', ['data/a.csv'], () => true)
    await vi.runAllTimersAsync()
    await expect(done).resolves.toMatchObject({ jobId: 'J' })
    vi.useRealTimers()
    expect(createExport.mock.calls[0][0]).toMatchObject({ document_id: 'DOC', files: ['data/a.csv'] })
    expect(createGrant).toHaveBeenCalledWith('J', { baseUrl: '/api/v1', token: 'A' })
  })

  it('signs nothing for a failed export', async () => {
    createExport.mockResolvedValue({ job_id: 'J' })
    getJob.mockResolvedValue({ state: 'failed' })
    await expect(exportForIntent(source, 'DOC', [], () => true)).rejects.toThrow('did not finish')
    expect(createGrant).not.toHaveBeenCalled()
  })
})

describe('waitForJob', () => {
  it('stops waiting when the popup flow ended', async () => {
    await expect(waitForJob('J', {}, () => false)).rejects.toThrow('left')
    expect(getJob).not.toHaveBeenCalled()
  })
})

describe('artifactBytes', () => {
  it('reads the artifact with the grant and no bearer', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(new Uint8Array([1, 2])))
    vi.stubGlobal('fetch', fetch)
    const grant = { payload: { artifact_url: 'https://api.a.example/api/v1/compute/jobs/J/artifacts/rocrate' } } as never
    expect(new Uint8Array(await artifactBytes(grant))).toEqual(new Uint8Array([1, 2]))
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.a.example/api/v1/compute/jobs/J/artifacts/rocrate')
    const headers = new Headers(init.headers)
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.get(GRANT_HEADER)).toBe(transferHeader(grant))
    vi.unstubAllGlobals()
  })
})

describe('exportFailure', () => {
  it('names a refusal by the source realm', () => {
    expect(exportFailure(new ApiError(403, 'x', 'export_denied'), 'Giessen Data')).toBe('Giessen Data does not allow this export.')
  })
})
