import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionEpoch = ref(1)
const writesDisabled = ref(false)
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ authToken: ref('t'), sessionEpoch }) }))
vi.mock('@/composables/s3/endpoints', () => ({ nodeApiBase: (id: string) => `https://${id}.test/api/v1` }))
vi.mock('@/lib/connectivity', () => ({ useConnectivity: () => ({ writesDisabled }) }))

const { removeBucket } = await import('./bucketRemoval')

const PREFLIGHT = {
  scope: { kind: 'bucket', bucket: 'raw-data' },
  counts: { current_heads: 0, noncurrent_versions: 0, delete_markers: 0, open_multipart_uploads: 0, complete: true },
  permissions: { read: true, purge: true },
}
const DONE = { job_id: 'j1', kind: 'storage_purge', state: 'succeeded', progress: { current: 1, unit: 'items' } }

let calls: { method: string; url: string }[] = []
// Answers the node's routes; `beforeAnswer` runs while the preflight is in flight.
function serve(beforeAnswer: () => void = () => {}, job: Record<string, unknown> = DONE) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ method: init?.method ?? 'GET', url })
      if (url.endsWith('/deletion/preflight')) {
        beforeAnswer()
        return Response.json(PREFLIGHT)
      }
      if (url.endsWith('/purge/jobs')) return Response.json({ job_id: 'j1', created: true, status_url: '' })
      return Response.json(job)
    }),
  )
}

beforeEach(() => {
  calls = []
  sessionEpoch.value = 1
  writesDisabled.value = false
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('bucket removal', () => {
  it('purges on the bucket node and finishes when the purge job succeeded', async () => {
    serve()
    await removeBucket('node-2', 'raw-data')

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://node-2.test/api/v1/data/storage/deletion/preflight',
      'POST https://node-2.test/api/v1/data/storage/purge/jobs',
      'GET https://node-2.test/api/v1/compute/jobs/j1',
    ])
  })

  it('reports progress through the purge job it was given', async () => {
    serve()
    const { usePurgeJob } = await import('@/components/data/deletion/usePurgeJob')
    const job = usePurgeJob()
    await removeBucket('node-2', 'raw-data', job)

    expect(job.status.value?.state).toBe('succeeded')
  })

  it('names a failed purge job', async () => {
    serve(() => {}, { ...DONE, state: 'failed', error: { message: 'bucket is locked', kind: 'x' } })
    await expect(removeBucket('node-2', 'raw-data')).rejects.toThrow('bucket is locked')
  })

  it('purges nothing when the session changed during the check', async () => {
    serve(() => (sessionEpoch.value = 2))
    await expect(removeBucket('node-2', 'raw-data')).rejects.toThrow('Your session changed.')
    expect(calls.some((call) => call.url.endsWith('/purge/jobs'))).toBe(false)
  })

  it('purges nothing when the connection dropped during the check', async () => {
    serve(() => (writesDisabled.value = true))
    await expect(removeBucket('node-2', 'raw-data')).rejects.toThrow('You are offline.')
    expect(calls.some((call) => call.url.endsWith('/purge/jobs'))).toBe(false)
  })
})
