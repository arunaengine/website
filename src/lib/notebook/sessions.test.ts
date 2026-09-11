import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import type { JobStatusResponse } from '@/lib/jobs'

const jobs = vi.hoisted(() => ({ listJobs: vi.fn() }))
vi.mock('@/lib/jobs', () => jobs)
const state = vi.hoisted(() => ({ getSessionState: vi.fn() }))
vi.mock('@/lib/notebook/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notebook/session')>()),
  getSessionState: state.getSessionState,
}))

const { listRunningSessions } = await import('./sessions')

const client = { baseUrl: '/api/v1', token: 'bearer-token' }
const nodeClient = (nodeId: string) => ({ baseUrl: `https://${nodeId}.example/api/v1`, token: 'bearer-token' })
const options = { client, nodeClient }

function job(id: string, overrides: Partial<JobStatusResponse> = {}): JobStatusResponse {
  return {
    job_id: id,
    kind: 'execution',
    state: 'running',
    attempts: 1,
    cancel_requested: false,
    created_at: '2026-09-11T10:00:00Z',
    updated_at: '2026-09-11T10:00:00Z',
    progress: { current: 0, unit: 'steps' },
    workspace_bucket: 'lab-data',
    workspace_mode: 'existing',
    family: {
      request_digest: 'digest',
      canonical_job_id: id,
      aliases: [],
      alias_count: 0,
      conflict_count: 0,
      logical_state: 'running',
      executions: 1,
      execution_list: [
        { execution_id: 'exec-1', executor_node_id: 'node-a', state: 'running', started_at_ms: 1, observed_at_ms: 1, canonical: true },
      ],
      duplicate_successes: 0,
      outputs: [],
      revision: 1,
      projection_digest: 'projection',
      partial: false,
      locally_exhausted: false,
      cancel_requested: false,
    },
    ...overrides,
  } as JobStatusResponse
}

function sessionState(overrides: Record<string, unknown> = {}) {
  return {
    job_id: '01JOB',
    state: 'ready',
    runtime: 'python-notebook',
    workspace_bucket: 'lab-data',
    executor_node_id: 'node-a',
    started_at_ms: 5,
    idle_after_ms: 1_800_000,
    idle_deadline_ms: 6,
    credential_expires_at_ms: 7,
    last_event_id: 2,
    cells: [],
    ...overrides,
  }
}

beforeEach(() => {
  jobs.listJobs.mockReset()
  state.getSessionState.mockReset()
})

describe('listRunningSessions', () => {
  it('keeps the running jobs the node confirms as sessions', async () => {
    jobs.listJobs.mockResolvedValue({ jobs: [job('01JOB'), job('01RUN', { workspace_mode: 'none', workspace_bucket: undefined })] })
    state.getSessionState.mockResolvedValue(sessionState())
    const found = await listRunningSessions(options)
    expect(jobs.listJobs).toHaveBeenCalledWith({ state: 'running', limit: 50 }, client)
    expect(state.getSessionState).toHaveBeenCalledTimes(1)
    expect(state.getSessionState).toHaveBeenCalledWith('01JOB', nodeClient('node-a'))
    expect(found).toEqual({
      sessions: [{ jobId: '01JOB', nodeId: 'node-a', runtime: 'python-notebook', bucket: 'lab-data', startedAtMs: 5, state: 'ready' }],
      unchecked: 0,
    })
  })

  it('drops a job that is no session and an ended one', async () => {
    jobs.listJobs.mockResolvedValue({ jobs: [job('01JOB'), job('01OLD')] })
    state.getSessionState.mockImplementation(async (id: string) => {
      if (id === '01JOB') throw new ApiError(404, 'no session here')
      return sessionState({ job_id: '01OLD', state: 'ended' })
    })
    const found = await listRunningSessions(options)
    expect(found).toEqual({ sessions: [], unchecked: 0 })
  })

  it('follows the node a session moved to', async () => {
    jobs.listJobs.mockResolvedValue({ jobs: [job('01JOB')] })
    state.getSessionState.mockImplementation(async (_id: string, used: { baseUrl: string }) => {
      if (used.baseUrl === nodeClient('node-a').baseUrl) {
        throw new ApiError(409, 'elsewhere', 'session_not_here', { executor_node_id: 'node-b' })
      }
      return sessionState({ executor_node_id: 'node-b' })
    })
    const found = await listRunningSessions(options)
    expect(found.sessions).toEqual([expect.objectContaining({ jobId: '01JOB', nodeId: 'node-b' })])
  })

  it('counts a candidate no node answered for instead of hiding it', async () => {
    jobs.listJobs.mockResolvedValue({ jobs: [job('01JOB'), job('01TWO')] })
    state.getSessionState.mockImplementation(async (id: string) => {
      if (id === '01TWO') throw new Error('network down')
      return sessionState()
    })
    const found = await listRunningSessions(options)
    expect(found.sessions.map((entry) => entry.jobId)).toEqual(['01JOB'])
    expect(found.unchecked).toBe(1)
  })

  it('reports the listing failure instead of an empty list', async () => {
    jobs.listJobs.mockRejectedValue(new Error('jobs unavailable'))
    await expect(listRunningSessions(options)).rejects.toThrow('jobs unavailable')
  })
})
