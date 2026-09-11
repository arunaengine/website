// The notebook sessions that are running right now, so a notebook can pick up
// a kernel another browser started. The job list carries no tags, so every
// candidate is confirmed by asking the node that runs it for its session state.
import type { ApiClientOptions } from '@/lib/api'
import { listJobs, type JobStatusResponse } from '@/lib/jobs'
import { getSessionState, sessionAbsent, sessionNotHere, type SessionRunState } from '@/lib/notebook/session'

/** Only a job that is running holds a live kernel a notebook can attach to. */
const LIVE_STATE = 'running'
/** Bound on the per-node confirmations one listing sends. */
const MAX_CANDIDATES = 12

export interface RunningSession {
  jobId: string
  nodeId: string
  runtime: string
  bucket: string
  startedAtMs: number
  state: SessionRunState
}

export interface RunningSessions {
  sessions: RunningSession[]
  /** Running jobs no node answered for; the list is incomplete then. */
  unchecked: number
}

export interface RunningSessionsOptions {
  /** The realm the portal signed into, which owns the job list. */
  client: ApiClientOptions
  /** The API of the node that runs a job; session routes live there alone. */
  nodeClient: (nodeId: string) => ApiClientOptions
  limit?: number
}

/** The node that runs the job, from the canonical execution of its family. */
export function executorNode(job: JobStatusResponse): string {
  const executions = job.family?.execution_list ?? []
  const canonical = executions.find((execution) => execution.canonical) ?? executions[0]
  return canonical?.executor_node_id ?? ''
}

/** A session job works in an existing workspace bucket; the node confirms it. */
function candidate(job: JobStatusResponse): boolean {
  return job.kind === 'execution' && job.workspace_mode === 'existing' && Boolean(job.workspace_bucket)
}

/** The session behind this job, null when it is no session, 'unknown' when
 * nobody answered for it. */
async function readSession(
  job: JobStatusResponse,
  options: RunningSessionsOptions,
  node: string,
  followed = false,
): Promise<RunningSession | 'unknown' | null> {
  try {
    const state = await getSessionState(job.job_id, node ? options.nodeClient(node) : options.client)
    if (state.state === 'ended') return null
    return {
      jobId: job.job_id,
      nodeId: state.executor_node_id || node,
      runtime: state.runtime,
      bucket: state.workspace_bucket || job.workspace_bucket || '',
      startedAtMs: state.started_at_ms,
      state: state.state,
    }
  } catch (cause) {
    const elsewhere = sessionNotHere(cause)
    if (elsewhere && !followed && elsewhere !== node) return readSession(job, options, elsewhere, true)
    // A 404 means this job is no session of this caller, which is an answer.
    return sessionAbsent(cause) ? null : 'unknown'
  }
}

export async function listRunningSessions(options: RunningSessionsOptions): Promise<RunningSessions> {
  const page = await listJobs({ state: LIVE_STATE, limit: options.limit ?? 50 }, options.client)
  const candidates = page.jobs.filter(candidate)
  const asked = candidates.slice(0, MAX_CANDIDATES)
  const found = await Promise.all(asked.map((job) => readSession(job, options, executorNode(job))))
  return {
    sessions: found.filter((entry): entry is RunningSession => entry !== null && entry !== 'unknown'),
    unchecked: found.filter((entry) => entry === 'unknown').length + (candidates.length - asked.length),
  }
}
