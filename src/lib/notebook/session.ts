// Client for the notebook session routes of the node that runs the session job.
// Every call goes to that node's API base (decision 4 of the design), so the
// caller passes the client it resolved from the realm node list.
import { ApiError, apiRequest, apiUrl, type ApiClientOptions } from '@/lib/api'
import type { JobStatusResponse } from '@/lib/jobs'
import { readSseFrames, type SseFrame } from '@/lib/sse'
import type { NotebookOutput } from './nbformat'

export type SessionRunState = 'starting' | 'ready' | 'busy' | 'ended'
export type SessionCellRunState = 'queued' | 'running' | 'done' | 'error' | 'interrupted'
export type SessionEndReason = 'ended' | 'idle' | 'walltime' | 'cancelled' | 'kernel_exit' | 'node_restart'
export type KernelState = 'starting' | 'idle' | 'busy' | 'dead'

export interface SessionCell {
  cell_id: string
  state: SessionCellRunState
  execution_count?: number
  started_at_ms?: number
  finished_at_ms?: number
}

/** The session as GET /session reports it, and the `session` event without cells. */
export interface SessionSummary {
  job_id: string
  state: SessionRunState
  runtime: string
  workspace_bucket: string
  executor_node_id: string
  started_at_ms: number
  idle_after_ms: number
  idle_deadline_ms: number
  credential_expires_at_ms: number
  last_event_id: number
  ended?: { reason: SessionEndReason }
}

export interface SessionState extends SessionSummary {
  cells: SessionCell[]
}

export interface SessionOutputEvent {
  cell_id: string
  seq: number
  output: NotebookOutput
}

export type SessionEvent =
  | { id: number; type: 'session'; data: SessionSummary }
  | { id: number; type: 'cell'; data: SessionCell }
  | { id: number; type: 'output'; data: SessionOutputEvent }
  | { id: number; type: 'kernel'; data: { state: KernelState } }
  | { id: number; type: 'credential'; data: { expires_at_ms: number } }
  | { id: number; type: 'gap'; data: { from: number; to: number } }
  | { id: number; type: 'ended'; data: { reason: SessionEndReason } }

export interface StagedInputRequest {
  bucket: string
  key: string
  version_id?: string
  source_node_id?: string
  /** Full key inside the workspace bucket; the portal writes under data/. */
  dest_key: string
}

export interface StagedInput {
  dest_key: string
  bytes: number
  blake3: string
  source_node_id?: string
  version_id?: string
}

export interface SessionInputsResponse {
  staged: StagedInput[]
  pending: { dest_key: string; job_id: string }[]
}

export interface ScratchEntry {
  name: string
  kind: 'file' | 'dir'
  bytes: number
  modified_ms: number
}

export interface ScratchListing {
  path: string
  entries: ScratchEntry[]
}

function sessionPath(jobId: string, suffix = ''): string {
  return `/compute/jobs/${encodeURIComponent(jobId)}/session${suffix}`
}

export function getSessionState(jobId: string, client: ApiClientOptions): Promise<SessionState> {
  return apiRequest<SessionState>(sessionPath(jobId), {}, client)
}

/** 409 `cell_busy`, `session_starting` or `session_ended`; 429 when the queue is full. */
export function runSessionCell(
  jobId: string,
  cell: { cell_id: string; code: string },
  client: ApiClientOptions,
): Promise<{ cell_id: string; position: number }> {
  return apiRequest(sessionPath(jobId, '/cells'), { method: 'POST', body: JSON.stringify(cell) }, client)
}

export function interruptSession(jobId: string, client: ApiClientOptions): Promise<void> {
  return apiRequest(sessionPath(jobId, '/interrupt'), { method: 'POST' }, client)
}

export function endSession(jobId: string, client: ApiClientOptions): Promise<JobStatusResponse> {
  return apiRequest<JobStatusResponse>(sessionPath(jobId, '/end'), { method: 'POST' }, client)
}

export function addSessionInputs(
  jobId: string,
  items: StagedInputRequest[],
  client: ApiClientOptions,
): Promise<SessionInputsResponse> {
  return apiRequest<SessionInputsResponse>(
    sessionPath(jobId, '/inputs'),
    { method: 'POST', body: JSON.stringify({ items }) },
    client,
  )
}

export function listScratch(
  jobId: string,
  path: string,
  client: ApiClientOptions,
): Promise<ScratchListing> {
  return apiRequest<ScratchListing>(sessionPath(jobId, '/scratch'), { query: { path } }, client)
}

export interface ScratchFile {
  blob: Blob
  contentType: string
}

/**
 * Reads one file from the container's working directory. The node caps it at
 * 8 MiB and answers 413 above that.
 */
export async function readScratch(
  jobId: string,
  path: string,
  client: ApiClientOptions,
): Promise<ScratchFile> {
  const headers = new Headers()
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  const response = await fetch(apiUrl(sessionPath(jobId, '/scratch/read'), { path }, client), { headers })
  if (!response.ok) {
    throw new ApiError(response.status, `${response.status} ${response.statusText}`)
  }
  return {
    blob: await response.blob(),
    contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
  }
}

/** The node runs this session, or a 409 names the node that does. */
export function sessionNotHere(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  if (error.code !== 'session_not_here') return null
  const node = error.details?.executor_node_id
  return typeof node === 'string' && node ? node : null
}

/** The session is gone, so the notebook detaches instead of retrying. */
export function sessionAbsent(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

// ── Event stream ─────────────────────────────────────────────────────────────
// A fetch reader, not EventSource: the stream needs the bearer header. The
// resume point travels as a query parameter, because the executing node is a
// different origin and a Last-Event-ID header would not survive the preflight.

const EVENT_TYPES = new Set(['session', 'cell', 'output', 'kernel', 'credential', 'gap', 'ended'])

export function sessionEventFrom(frame: SseFrame): SessionEvent | null {
  if (!EVENT_TYPES.has(frame.event)) return null
  let data: unknown
  try {
    data = JSON.parse(frame.data)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const id = Number(frame.id)
  return {
    id: Number.isSafeInteger(id) && id > 0 ? id : 0,
    type: frame.event,
    data,
  } as SessionEvent
}

export interface SessionStreamOptions {
  jobId: string
  /** Read again on every attempt, so a refreshed token and a new node are used. */
  client: () => ApiClientOptions
  /** Resume point; the first connect asks for everything after it. */
  lastEventId?: number
  onEvent: (event: SessionEvent) => void
  /** Called with the reason a connection ended, before the next attempt. */
  onError?: (error: unknown) => void
  onOpen?: () => void
  fetchImpl?: typeof fetch
  /** Backoff before attempt n (1 based); the default doubles up to 15 s. */
  retryDelayMs?: (attempt: number) => number
  /** No byte for this long means a dead connection; keep-alives reset it. */
  idleTimeoutMs?: number
}

export interface SessionStream {
  close: () => void
  lastEventId: () => number
}

function defaultRetry(attempt: number): number {
  return Math.min(1_000 * 2 ** (attempt - 1), 15_000)
}

export function openSessionStream(options: SessionStreamOptions): SessionStream {
  const run = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const retry = options.retryDelayMs ?? defaultRetry
  const idleTimeoutMs = options.idleTimeoutMs ?? 45_000
  let lastEventId = options.lastEventId ?? 0
  let closed = false
  let controller: AbortController | null = null

  function stop() {
    closed = true
    controller?.abort()
    controller = null
  }

  function applyFrame(frame: SseFrame) {
    const event = sessionEventFrom(frame)
    if (!event) return
    if (event.id) lastEventId = event.id
    options.onEvent(event)
  }

  // A refusal carries the code and the body the caller needs to react to it.
  async function refusal(response: Response): Promise<ApiError> {
    let body: Record<string, unknown> = {}
    try {
      body = (await response.json()) as Record<string, unknown>
    } catch {
      // Not every refusal carries a JSON body.
    }
    const message = typeof body.error === 'string' ? body.error : `${response.status} ${response.statusText}`
    const code = typeof body.code === 'string' ? body.code : undefined
    return new ApiError(response.status, message, code, body)
  }

  /** One attempt; answers true when the stream was open before it ended. */
  async function connect(): Promise<boolean> {
    const active = new AbortController()
    controller = active
    let opened = false
    let watchdog = setTimeout(() => active.abort(), idleTimeoutMs)
    const touch = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => active.abort(), idleTimeoutMs)
    }
    try {
      const client = options.client()
      const headers = new Headers({ Accept: 'text/event-stream' })
      if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
      const url = apiUrl(
        sessionPath(options.jobId, '/events'),
        lastEventId ? { after: lastEventId } : {},
        client,
      )
      const response = await run(url, { headers, cache: 'no-store', signal: active.signal })
      if (!response.ok) throw await refusal(response)
      opened = true
      options.onOpen?.()
      // Any byte proves the connection lives, a keep-alive comment included.
      await readSseFrames(response.body, applyFrame, touch)
    } catch (cause) {
      if (!closed) options.onError?.(cause)
    } finally {
      clearTimeout(watchdog)
      if (controller === active) controller = null
    }
    return opened
  }

  async function loop() {
    let attempt = 0
    while (!closed) {
      // A connection that was open starts the backoff over.
      attempt = (await connect()) ? 1 : attempt + 1
      if (closed) return
      await new Promise((resolve) => setTimeout(resolve, retry(attempt)))
    }
  }

  void loop()
  return { close: stop, lastEventId: () => lastEventId }
}
