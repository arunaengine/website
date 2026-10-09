import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { GRANT_HEADER, transferHeader } from '@/lib/api/federation'

const createExport = vi.fn()
const createGrant = vi.fn()
const getJob = vi.fn()
const pushExport = vi.fn()

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  createExport: (...args: unknown[]) => createExport(...args),
  createGrant: (...args: unknown[]) => createGrant(...args),
  pushExport: (...args: unknown[]) => pushExport(...args),
}))
vi.mock('@/lib/jobs', async (original) => ({
  ...(await original<typeof import('@/lib/jobs')>()),
  getJob: (...args: unknown[]) => getJob(...args),
}))

const { SESSION_CHANGED, artifactBytes, exportFailure, exportForIntent, serveFollowUps, waitForJob } = await import(
  './useSourceExport'
)

const source = { descriptor: { payload: {} }, intent: { payload: {} }, client: { baseUrl: '/api/v1', token: 'A' } } as never

beforeEach(() => {
  for (const mock of [createExport, createGrant, getJob, pushExport]) mock.mockReset()
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

  it('submits nothing when the popup flow ended before the export', async () => {
    await expect(exportForIntent(source, 'DOC', [], () => false)).rejects.toThrow('left')
    expect(createExport).not.toHaveBeenCalled()
  })

  it('signs nothing when the login changed during the last job read', async () => {
    let alive = true
    createExport.mockResolvedValue({ job_id: 'J' })
    getJob.mockImplementation(async () => {
      alive = false
      return { state: 'succeeded' }
    })
    await expect(exportForIntent(source, 'DOC', [], () => alive)).rejects.toThrow('left')
    expect(createGrant).not.toHaveBeenCalled()
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

describe('serveFollowUps', () => {
  // Hands out the given requests, then ends like a closed opener.
  function opener(...bodies: unknown[]) {
    const queue = bodies.map((body, index) => ({ id: index + 1, body, origin: 'https://b.example' }))
    return {
      next: vi.fn(async () => {
        const request = queue.shift()
        if (!request) throw new Error('closed')
        return request
      }),
      reply: vi.fn(),
      refuse: vi.fn(),
    }
  }
  const granted = (alive: () => boolean) => ({ jobId: 'J', grant: { payload: {} } as never, files: 1, alive })

  it('pushes while the login is the same and refuses after it changed', async () => {
    let alive = true
    pushExport.mockImplementation(async () => {
      alive = false
      return { upload_id: 'U' }
    })
    const link = opener({ kind: 'push' }, { kind: 'push' })
    await serveFollowUps(link, source, granted(() => alive), 'Giessen Data')
    expect(pushExport).toHaveBeenCalledOnce()
    expect(link.reply).not.toHaveBeenCalled()
    expect(link.refuse.mock.calls.map(([request, message]) => [request.id, message])).toEqual([
      [1, SESSION_CHANGED],
      [2, SESSION_CHANGED],
    ])
  })

  it('passes the node error code with a refusal', async () => {
    pushExport.mockRejectedValue(new ApiError(502, 'unreachable', 'push_unreachable'))
    const link = opener({ kind: 'push' })
    await serveFollowUps(link, source, granted(() => true), 'Giessen Data')
    expect(link.refuse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      'This realm cannot reach the other realm.',
      'push_unreachable',
    )
  })
})

describe('exportFailure', () => {
  it('names a refusal by the source realm', () => {
    expect(exportFailure(new ApiError(403, 'x', 'export_denied'), 'Giessen Data')).toBe('Giessen Data does not allow this export.')
  })
})
