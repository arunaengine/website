import { afterEach, describe, expect, it, vi } from 'vitest'
import { getJob, getJobAudit, type JobStatusResponse } from './jobs'

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
