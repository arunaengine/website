import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadJobArtifact,
  getJob,
  getJobAudit,
  getJobReport,
  headJobArtifact,
  isReportAbsent,
  isReportCursorConflict,
  placementVerdict,
  reportPendingState,
  type JobStatusResponse,
} from './jobs'
import { ApiError } from './api'

const familyFixture: JobStatusResponse = {
  job_id: '01JJRSTVWXYZ0123456789ABCD',
  kind: 'execution',
  state: 'succeeded',
  attempts: 1,
  cancel_requested: false,
  created_at: '2026-04-09T14:23:11.123+00:00',
  updated_at: '2026-04-09T14:31:47.902+00:00',
  finished_at: '2026-04-09T14:31:47.902+00:00',
  progress: { current: 5, total: 5, unit: 'phases' },
  workspace_bucket: 'ws-01jjrstvwxyz0123456789abcd',
  workspace_mode: 'kept',
  family: {
    submission_id: '6b1f8c9d0e2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4',
    request_digest: '9d3b0c1a2e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
    canonical_job_id: '01JJRSTVWXYZ0123456789ABCD',
    aliases: ['01JJRSTVWXYZ0123456789ABCD'],
    alias_count: 1,
    conflict_count: 0,
    logical_state: 'succeeded',
    canonical_execution_id: '01JJRSEXEC0123456789ABCDEF',
    executions: 2,
    duplicate_successes: 1,
    outputs: [
      {
        bucket: 'ws-01jjrstvwxyz0123456789abcd',
        key: 'reports/reads_fastqc.html',
        version_id: '01JJRSVERSION0123456789ABC',
        execution_id: '01JJRSEXEC0123456789ABCDEF',
        container_path: '/outputs/reads_fastqc.html',
        size: 20480,
        digest: 'fa2c8cc4f28176bbeed4b736df569a34c79cd3723e9ec42f9674b4d46ac6b8b8',
        endpoint_url: 'https://owner.node.test',
      },
    ],
    revision: 7,
    projection_digest: '1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f',
    eventually_consistent: true,
    responder_node_id: 'f3a1b2c3d4e5f60718293a4b5c6d7e8f9091a2b3c4d5e6f708192a3b4c5d6e7f',
    partial: false,
    locally_exhausted: false,
    cancel_requested: false,
    placement: {
      executor_kind: 'docker',
      estimated_transfer_bytes: 4194304,
      estimated_transfer_ms: 340,
      alternatives: 2,
      rejected: 1,
      omitted: 0,
      sealed_at_ms: 1755500000000,
    },
  },
}

function stubResponse(body: unknown, urls: string[]) {
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('distributed job API', () => {
  it('maps the complete family block from a job fixture', async () => {
    const urls: string[] = []
    stubResponse(familyFixture, urls)

    const job = await getJob(familyFixture.job_id, { baseUrl: 'https://node.test/api/v1', token: 'token' })

    expect(job.family).toEqual(familyFixture.family)
    expect(job.family?.placement?.estimated_transfer_bytes).toBe(4194304)
    expect(job.family?.outputs[0]?.version_id).toBe('01JJRSVERSION0123456789ABC')
    expect(urls).toEqual([`https://node.test/api/v1/jobs/${familyFixture.job_id}`])
  })

  it('passes audit scope, cursor, and limit verbatim', async () => {
    const urls: string[] = []
    stubResponse(
      {
        submission_id: 'submission',
        request_digest: 'request',
        scope: 'submission',
        records: [],
        conflicts: [],
        projection_digest: 'projection',
        partial: false,
      },
      urls,
    )

    await getJobAudit(
      'job/id',
      { scope: 'submission', cursor: 'opaque-cursor', limit: 12 },
      { baseUrl: 'https://node.test/api/v1' },
    )

    expect(urls).toEqual([
      'https://node.test/api/v1/jobs/job%2Fid/audit?scope=submission&cursor=opaque-cursor&limit=12',
    ])
  })
})

const client = { baseUrl: 'https://node.test/api/v1', token: 'token' }

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  const calls: Array<{ url: string; method: string; auth: string | null }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init: RequestInit = {}) => {
      calls.push({
        url: String(input),
        method: (init.method ?? 'GET').toUpperCase(),
        auth: new Headers(init.headers).get('Authorization'),
      })
      return handler(String(input), init)
    }),
  )
  return calls
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('placement verdict', () => {
  it('reads a zero estimate as compute-to-data', () => {
    const verdict = placementVerdict({ executor_kind: 'docker', estimated_transfer_bytes: 0 })

    expect(verdict.verdict).toBe('compute-to-data')
    expect(verdict.explanation).toContain('move no bytes')
  })

  it('reads any moved byte as data-to-compute', () => {
    expect(placementVerdict({ executor_kind: 'docker', estimated_transfer_bytes: 1 }).verdict).toBe(
      'data-to-compute',
    )
  })

  it('stays unplaced without an executor kind', () => {
    // A zero estimate with no chosen executor is an absent plan, not locality.
    expect(placementVerdict({ estimated_transfer_bytes: 0 }).verdict).toBe('unplaced')
    expect(placementVerdict(null).verdict).toBe('unplaced')
    expect(placementVerdict(undefined).verdict).toBe('unplaced')
  })
})

describe('job report', () => {
  it('passes limit and cursor verbatim', async () => {
    const calls = stubFetch(() => jsonResponse(200, { rows: [], report_digest: 'digest' }))

    await getJobReport('job/id', { limit: 25, cursor: 'opaque' }, client)

    expect(calls[0].url).toBe('https://node.test/api/v1/jobs/job%2Fid/report?limit=25&cursor=opaque')
  })

  it('separates a pending report from an absent one', () => {
    const pending = new ApiError(404, 'not ready', 'report_pending', {
      code: 'report_pending',
      state: 'running',
    })
    const absent = new ApiError(404, 'Not found', 'Not found', {})

    expect(reportPendingState(pending)).toBe('running')
    expect(isReportAbsent(pending)).toBe(false)
    expect(reportPendingState(absent)).toBeNull()
    expect(isReportAbsent(absent)).toBe(true)
    expect(isReportCursorConflict(new ApiError(409, 'stale cursor'))).toBe(true)
  })
})

describe('run crate artifact', () => {
  it('reports an available archive with its unquoted etag', async () => {
    const calls = stubFetch(
      () =>
        new Response(null, {
          status: 200,
          headers: {
            ETag: '"abc123"',
            'Content-Length': '4096',
            'Content-Disposition': "attachment; filename=\"run.zip\"; filename*=UTF-8''run%20crate.zip",
          },
        }),
    )

    const status = await headJobArtifact('01JOB', client)

    expect(calls[0].method).toBe('HEAD')
    expect(calls[0].auth).toBe('Bearer token')
    expect(status).toEqual({
      state: 'available',
      etag: 'abc123',
      size: 4096,
      filename: 'run crate.zip',
    })
  })

  it('maps every unavailable answer to its own state', async () => {
    const bodies: Array<[number, unknown, string]> = [
      [404, { error: 'not ready', code: 'artifact_pending', details: 'running' }, 'pending'],
      [404, { error: 'Not found', code: 'Not found' }, 'absent'],
      [410, { error: 'expired', code: 'artifact_expired' }, 'expired'],
      [403, { error: 'forbidden' }, 'unauthorized'],
      [416, { error: 'bad range', code: 'invalid_range' }, 'error'],
    ]
    for (const [status, body, expected] of bodies) {
      stubFetch(() => jsonResponse(status, body))
      const result = await headJobArtifact('01JOB', client)
      expect(result.state).toBe(expected)
      if (expected === 'pending') expect(result.jobState).toBe('running')
      vi.unstubAllGlobals()
    }
  })

  it('hands back the archive bytes on a full download', async () => {
    const calls = stubFetch(
      () =>
        new Response('zip-bytes', {
          status: 200,
          headers: { ETag: '"deadbeef"', 'Content-Length': '9' },
        }),
    )

    const result = await downloadJobArtifact('01JOB', client)

    expect(calls[0].method).toBe('GET')
    expect(result.state).toBe('available')
    expect(result.etag).toBe('deadbeef')
    expect(await result.blob?.text()).toBe('zip-bytes')
  })

  it('returns no blob when the archive is not there', async () => {
    stubFetch(() => jsonResponse(410, { error: 'expired', code: 'artifact_expired' }))

    const result = await downloadJobArtifact('01JOB', client)

    expect(result.state).toBe('expired')
    expect(result.blob).toBeUndefined()
  })
})
