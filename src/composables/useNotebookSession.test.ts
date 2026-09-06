import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { ApiError } from '@/lib/api'
import type { SessionEvent } from '@/lib/notebook/session'

const s3 = vi.hoisted(() => ({ getObjectText: vi.fn(), putTextObject: vi.fn() }))
vi.mock('@/composables/useS3', () => ({ useS3: () => s3 }))
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl: { value: '/api/v1' }, authToken: { value: 'bearer-token' } }),
}))
vi.mock('@/composables/useRealmNodes', () => ({
  useRealmNodes: () => ({
    nodeById: (id: string) => (id ? { apiBase: `https://${id}.example/api/v1` } : null),
  }),
}))

const jobs = vi.hoisted(() => ({
  getJob: vi.fn(),
  submitJob: vi.fn(),
  submitErrorMessage: (error: unknown) => String((error as Error)?.message ?? error),
}))
vi.mock('@/lib/jobs', () => jobs)

const session = vi.hoisted(() => ({
  getSessionState: vi.fn(),
  runSessionCell: vi.fn(),
  endSession: vi.fn(),
  interruptSession: vi.fn(),
  openSessionStream: vi.fn(),
  stream: { emit: (_event: SessionEvent) => {} },
}))
vi.mock('@/lib/notebook/session', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/notebook/session')>()
  return {
    ...original,
    getSessionState: session.getSessionState,
    runSessionCell: session.runSessionCell,
    endSession: session.endSession,
    interruptSession: session.interruptSession,
    openSessionStream: session.openSessionStream,
  }
})

const { createNotebook } = await import('./useNotebook')
const { createNotebookSession } = await import('./useNotebookSession')

function state(overrides: Record<string, unknown> = {}) {
  return {
    job_id: '01JOB',
    state: 'ready',
    runtime: 'python-notebook',
    workspace_bucket: 'lab-data',
    executor_node_id: 'node-a',
    started_at_ms: 1,
    idle_after_ms: 1_800_000,
    idle_deadline_ms: 2,
    credential_expires_at_ms: 3,
    last_event_id: 7,
    cells: [],
    ...overrides,
  }
}

async function setup() {
  s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
  const notebook = createNotebook(ref('lab-data'), ref('notebooks/counts.ipynb'), () => ({
    runtime: 'python-notebook',
    group_id: 'group-1',
  }))
  await notebook.load()
  const scope = effectScope()
  const store = scope.run(() => createNotebookSession(notebook))!
  return { notebook, session: store, scope }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', undefined)
  for (const mock of [
    s3.getObjectText,
    s3.putTextObject,
    jobs.getJob,
    jobs.submitJob,
    session.getSessionState,
    session.runSessionCell,
    session.endSession,
    session.openSessionStream,
  ]) {
    mock.mockReset()
  }
  session.openSessionStream.mockImplementation((options: { onEvent: (event: SessionEvent) => void }) => {
    session.stream.emit = options.onEvent
    return { close: vi.fn(), lastEventId: () => 0 }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createNotebookSession', () => {
  it('attaches to the session the notebook names', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())

    await store.attachSaved()

    expect(store.jobId.value).toBe('01JOB')
    expect(store.live.value).toBe(true)
    // The session routes are served by the node that runs the job.
    expect(session.getSessionState).toHaveBeenCalledWith('01JOB', {
      baseUrl: 'https://node-a.example/api/v1',
      token: 'bearer-token',
    })
    expect(session.openSessionStream).toHaveBeenCalledOnce()
    expect(session.openSessionStream.mock.calls[0][0].lastEventId).toBe(7)
    scope.stop()
  })

  it('follows the node a 409 names', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState
      .mockRejectedValueOnce(
        new ApiError(409, 'session_not_here', 'session_not_here', { executor_node_id: 'node-b' }),
      )
      .mockResolvedValueOnce(state({ executor_node_id: 'node-b' }))

    await store.attachSaved()

    expect(store.nodeId.value).toBe('node-b')
    expect(notebook.meta.value?.executor_node_id).toBe('node-b')
    expect(session.getSessionState.mock.calls[1][1].baseUrl).toBe('https://node-b.example/api/v1')
    scope.stop()
  })

  it('reports a session that is gone', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockRejectedValue(new ApiError(404, 'not found'))

    await store.attachSaved()

    expect(store.live.value).toBe(false)
    expect(store.error.value).toContain('no longer running')
    expect(session.openSessionStream).not.toHaveBeenCalled()
    scope.stop()
  })

  it('writes stream events into the notebook', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const cell = notebook.cells.value[0]

    session.stream.emit({ id: 8, type: 'kernel', data: { state: 'busy' } })
    session.stream.emit({
      id: 9,
      type: 'output',
      data: { cell_id: cell.id, seq: 1, output: { output_type: 'stream', name: 'stdout', text: 'hi\n' } },
    })
    session.stream.emit({
      id: 10,
      type: 'cell',
      data: { cell_id: cell.id, state: 'done', execution_count: 4, finished_at_ms: 99 },
    })

    expect(store.kernel.value).toBe('busy')
    expect(cell.outputs).toHaveLength(1)
    expect(cell.execution_count).toBe(4)
    expect(store.cellStates.value[cell.id].state).toBe('done')
    scope.stop()
  })

  it('re-reads the state after a gap', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()

    session.stream.emit({ id: 11, type: 'gap', data: { from: 8, to: 40 } })
    await Promise.resolve()

    expect(session.getSessionState).toHaveBeenCalledTimes(2)
    expect(store.notice.value).toContain('dropped')
    scope.stop()
  })

  it('closes the notebook session when it ends', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()

    session.stream.emit({ id: 12, type: 'ended', data: { reason: 'idle' } })

    expect(store.ended.value).toBe(true)
    expect(store.live.value).toBe(false)
    expect(store.notice.value).toContain('idle')
    scope.stop()
  })

  it('starts a session and remembers it in the notebook', async () => {
    const { notebook, session: store, scope } = await setup()
    jobs.submitJob.mockResolvedValue({ job_id: '01NEW' })
    jobs.getJob.mockResolvedValue({
      state: 'running',
      family: { execution_list: [{ executor_node_id: 'node-a', canonical: true }] },
    })
    session.getSessionState.mockResolvedValue(state({ job_id: '01NEW' }))

    await store.start({
      groupId: 'group-1',
      name: 'counts',
      runtime: 'python-notebook',
      workspaceBucket: 'lab-data',
      idempotencyKey: 'once',
    })

    const request = jobs.submitJob.mock.calls[0][0]
    expect(request.runtime).toBe('python-notebook')
    expect(request.workspace).toEqual({ mode: 'existing', bucket: 'lab-data' })
    expect(notebook.meta.value?.job_id).toBe('01NEW')
    expect(notebook.meta.value?.executor_node_id).toBe('node-a')
    expect(store.live.value).toBe(true)
    scope.stop()
  })

  it('clears the outputs of a cell it sends', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const cell = notebook.cells.value[0]
    notebook.appendOutput(cell.id, { output_type: 'stream', name: 'stdout', text: 'old\n' })
    session.runSessionCell.mockResolvedValue({ cell_id: cell.id, position: 0 })

    expect(await store.runCell(cell.id, 'print(1)')).toBe(true)
    expect(cell.outputs).toHaveLength(0)
    expect(store.cellStates.value[cell.id].state).toBe('queued')
    scope.stop()
  })

  it('reports a refused cell and forgets its queued state', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const cell = notebook.cells.value[0]
    session.runSessionCell.mockRejectedValue(new ApiError(409, 'cell_busy', 'cell_busy'))

    expect(await store.runCell(cell.id, 'print(1)')).toBe(false)
    expect(store.cellStates.value[cell.id]).toBeUndefined()
    expect(store.error.value).toContain('cell_busy')
    scope.stop()
  })
})
