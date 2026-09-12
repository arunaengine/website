import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { ApiError } from '@/lib/api'
import type { SessionEvent } from '@/lib/notebook/session'

const s3 = vi.hoisted(() => ({
  getObjectText: vi.fn(), putTextObject: vi.fn(), activateContext: vi.fn(),
  referenceForContext: (nodeId: string, groupId: string) => ({ nodeId, groupId, accessKeyId: 'temporary' }),
}))
vi.mock('@/composables/useS3', () => ({ useS3: () => s3 }))
const aruna = {
  apiBaseUrl: ref('/api/v1'), authToken: ref('bearer-token'),
  currentUser: ref({ id: 'user-a' }),
  nodeInfo: ref({ node: { realm_id: 'realm-a', peer_id: 'node-a' } }),
}
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => aruna,
}))
vi.mock('@/composables/useRealmNodes', () => ({
  useRealmNodes: () => ({
    nodeById: (id: string) => (id ? { apiBase: `https://${id}.example/api/v1` } : null),
  }),
}))

const jobs = vi.hoisted(() => ({
  getJob: vi.fn(),
  listJobs: vi.fn(),
  submitJob: vi.fn(),
  cancelJob: vi.fn(),
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
const { memoryStorage } = await import('@/test/storage')
const { readResumePoint, writeResumePoint } = await import('@/lib/notebook/document')

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
  const scope = effectScope()
  // The notebook lives in the scope too, so stopping it cancels its save timer.
  const notebook = scope.run(() => createNotebook(ref('lab-data'), ref('notebooks/counts.ipynb'), () => ({
    runtime: 'python-notebook',
    group_id: 'group-1',
  })))!
  await notebook.load()
  const store = scope.run(() => createNotebookSession(notebook))!
  return { notebook, session: store, scope }
}

beforeEach(() => {
  aruna.apiBaseUrl.value = '/api/v1'
  aruna.authToken.value = 'bearer-token'
  aruna.currentUser.value = { id: 'user-a' }
  vi.stubGlobal('localStorage', memoryStorage())
  for (const mock of [
    s3.getObjectText,
    s3.putTextObject,
    jobs.getJob,
    jobs.submitJob,
    jobs.cancelJob,
    session.getSessionState,
    session.runSessionCell,
    session.endSession,
    session.interruptSession,
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
  it.each([
    ['ready', 'idle'], ['busy', 'busy'], ['starting', 'starting'], ['ended', 'dead'],
  ])('restores kernel state when attaching to a %s session', async (phase, kernel) => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ state: phase }))
    await store.attachSaved()
    expect(store.kernel.value).toBe(kernel)
    scope.stop()
  })

  it('stops Run all when another session attaches during submission', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    let finish = () => {}
    session.runSessionCell.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const running = store.runCells([{ id: 'c1', source: 'old first' }, { id: 'c2', source: 'old second' }])
    notebook.patchMeta({ job_id: '01OTHER', executor_node_id: 'node-b' })
    session.getSessionState.mockResolvedValue(state({ job_id: '01OTHER', executor_node_id: 'node-b' }))
    await store.attachSaved()
    finish()
    await running
    expect(session.runSessionCell).toHaveBeenCalledOnce()
    expect(session.runSessionCell.mock.calls[0][0]).toBe('01JOB')
    expect(store.jobId.value).toBe('01OTHER')
    expect(store.error.value).toBeNull()
    scope.stop()
  })

  it('attaches to a session another browser started', async () => {
    const { notebook, session: store, scope } = await setup()
    session.getSessionState.mockResolvedValue(state({ job_id: '01OTHER', executor_node_id: 'node-b' }))
    await store.attachTo('01OTHER', 'node-b')
    expect(jobs.getJob).not.toHaveBeenCalled()
    expect(session.getSessionState).toHaveBeenCalledWith('01OTHER', {
      baseUrl: 'https://node-b.example/api/v1', token: 'bearer-token',
    })
    expect(store.jobId.value).toBe('01OTHER')
    expect(store.live.value).toBe(true)
    expect(notebook.meta.value?.job_id).toBe('01OTHER')
    expect(notebook.meta.value?.executor_node_id).toBe('node-b')
    scope.stop()
  })

  it('drops the session it was attached to before', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const closed = session.openSessionStream.mock.results[0].value.close
    session.getSessionState.mockResolvedValue(state({ job_id: '01OTHER', executor_node_id: 'node-b' }))
    await store.attachTo('01OTHER', 'node-b')
    expect(closed).toHaveBeenCalled()
    expect(store.state.value?.job_id).toBe('01OTHER')
    scope.stop()
  })

  it('looks up the node when the chosen session names none', async () => {
    const { session: store, scope } = await setup()
    jobs.getJob.mockResolvedValue({ state: 'running', family: { execution_list: [{ executor_node_id: 'node-c', canonical: true }] } })
    session.getSessionState.mockResolvedValue(state({ job_id: '01OTHER', executor_node_id: 'node-c' }))
    await store.attachTo('01OTHER')
    expect(jobs.getJob).toHaveBeenCalledWith('01OTHER', { baseUrl: '/api/v1', token: 'bearer-token' })
    expect(store.nodeId.value).toBe('node-c')
    scope.stop()
  })

  it('ignores old session state and callbacks after detach', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const oldEvent = session.stream.emit
    let finish = (_value: ReturnType<typeof state>) => {}
    session.getSessionState.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const refreshing = store.refresh()
    notebook.patchMeta({ job_id: '01OTHER', executor_node_id: 'node-b' })
    session.getSessionState.mockResolvedValue(state({ job_id: '01OTHER', executor_node_id: 'node-b' }))
    await store.attachSaved()
    finish(state())
    await refreshing
    oldEvent({ id: 50, type: 'ended', data: { reason: 'idle' } })
    expect(store.state.value?.job_id).toBe('01OTHER')
    expect(store.live.value).toBe(true)
    expect(notebook.meta.value?.executor_node_id).toBe('node-b')
    scope.stop()
  })

  it('does not submit after a dependency write outlives the document', async () => {
    const { notebook, session: store, scope } = await setup()
    let finish = () => {}
    s3.putTextObject.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const starting = store.start({
      groupId: 'group-1', name: 'counts', runtime: 'python-notebook', workspaceBucket: 'lab-data',
      dependencyKey: 'requirements.txt', dependencyKind: 'requirements', dependencyText: 'pandas',
    })
    await Promise.resolve()
    notebook.key.value = 'notebooks/another.ipynb'
    finish()
    await starting
    expect(jobs.submitJob).not.toHaveBeenCalled()
    expect(store.starting.value).toBe(false)
    scope.stop()
  })

  it('cancels a late admitted job using its original account', async () => {
    const { notebook, session: store, scope } = await setup()
    let finish = (_value: { job_id: string }) => {}
    jobs.submitJob.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    jobs.cancelJob.mockResolvedValue({ state: 'cancelled' })
    const starting = store.start({ groupId: 'group-1', name: 'counts', runtime: 'python-notebook', workspaceBucket: 'lab-data' })
    await vi.waitFor(() => expect(jobs.submitJob).toHaveBeenCalled())
    aruna.currentUser.value = { id: 'user-b' }
    aruna.apiBaseUrl.value = 'https://another.example/api/v1'
    aruna.authToken.value = 'new-token'
    await notebook.load()
    finish({ job_id: '01OLD' })
    await starting
    expect(jobs.cancelJob).toHaveBeenCalledWith('01OLD', { baseUrl: '/api/v1', token: 'bearer-token' })
    expect(notebook.meta.value?.job_id).toBeUndefined()
    expect(store.starting.value).toBe(false)
    scope.stop()
  })

  it('persists lower event ids after a node restart gap', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    session.stream.emit({ id: 100, type: 'kernel', data: { state: 'idle' } })
    session.stream.emit({ id: 0, type: 'gap', data: { from: 1, to: 2 } })
    session.stream.emit({ id: 2, type: 'kernel', data: { state: 'idle' } })
    store.detach()
    expect(readResumePoint(notebook.scope.value, '01JOB')).toBe(2)
    scope.stop()
  })

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
    })

    const request = jobs.submitJob.mock.calls[0][0]
    expect(request.runtime).toBe('python-notebook')
    expect(request.workspace).toEqual({ mode: 'existing', bucket: 'lab-data' })
    expect(notebook.meta.value?.job_id).toBe('01NEW')
    expect(notebook.meta.value?.executor_node_id).toBe('node-a')
    expect(store.live.value).toBe(true)
    scope.stop()
  })

  it('restarts with a new job only after ending the old kernel', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01OLD', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ job_id: '01OLD' }))
    await store.attachSaved()
    jobs.submitJob.mockResolvedValue({ job_id: '01NEW' })
    jobs.getJob.mockResolvedValue({ state: 'running', family: { execution_list: [{ executor_node_id: 'node-a', canonical: true }] } })
    session.getSessionState.mockResolvedValue(state({ job_id: '01NEW' }))
    await store.restart({ groupId: 'group-1', name: 'counts', runtime: 'python-notebook', workspaceBucket: 'lab-data' })
    expect(session.endSession).toHaveBeenCalledWith('01OLD', expect.anything())
    expect(session.endSession.mock.invocationCallOrder[0]).toBeLessThan(jobs.submitJob.mock.invocationCallOrder[0]!)
    expect(store.jobId.value).toBe('01NEW')
    expect(store.restarting.value).toBe(false)
    scope.stop()
  })

  it('does not start another kernel when stopping the old one fails', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01OLD', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ job_id: '01OLD' }))
    await store.attachSaved()
    session.endSession.mockRejectedValue(new Error('stop failed'))
    await store.restart({ groupId: 'group-1', name: 'counts', runtime: 'python-notebook', workspaceBucket: 'lab-data' })
    expect(jobs.submitJob).not.toHaveBeenCalled()
    expect(store.jobId.value).toBe('01OLD')
    expect(store.error.value).toBe('stop failed')
    scope.stop()
  })

  it('does not finish a restart after the notebook identity changes', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01OLD', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ job_id: '01OLD' }))
    await store.attachSaved()
    let finish = () => {}
    session.endSession.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    const restarting = store.restart({ groupId: 'group-1', name: 'counts', runtime: 'python-notebook', workspaceBucket: 'lab-data' })
    aruna.currentUser.value = { id: 'another-user' }
    finish()
    await restarting
    expect(jobs.submitJob).not.toHaveBeenCalled()
    expect(store.restarting.value).toBe(false)
    scope.stop()
  })

  it('writes the dependency file before it submits', async () => {
    const { session: store, scope } = await setup()
    s3.putTextObject.mockResolvedValue({ versionId: 'v1' })
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
      dependencyKey: 'notebooks/counts.requirements.txt',
      dependencyKind: 'requirements',
      dependencyText: 'pandas>=2\n',
    })

    expect(s3.putTextObject).toHaveBeenCalledWith(
      'lab-data',
      'notebooks/counts.requirements.txt',
      'pandas>=2\n',
      'text/plain',
      'node-a',
      { nodeId: 'node-a', groupId: 'group-1', accessKeyId: 'temporary' },
    )
    // The file has to exist before the node stages it.
    expect(s3.putTextObject.mock.invocationCallOrder[0]).toBeLessThan(
      jobs.submitJob.mock.invocationCallOrder[0],
    )
    scope.stop()
  })

  it('reports a dependency file it could not write', async () => {
    const { session: store, scope } = await setup()
    s3.putTextObject.mockRejectedValue(new Error('bucket is full'))

    await store.start({
      groupId: 'group-1',
      name: 'counts',
      runtime: 'python-notebook',
      workspaceBucket: 'lab-data',
      dependencyKey: 'notebooks/counts.requirements.txt',
      dependencyKind: 'requirements',
      dependencyText: 'pandas>=2',
    })

    expect(jobs.submitJob).not.toHaveBeenCalled()
    expect(store.error.value).toContain('bucket is full')
    scope.stop()
  })

  it('forgets a job it submitted but cannot follow', async () => {
    const { notebook, session: store, scope } = await setup()
    jobs.submitJob.mockResolvedValue({ job_id: '01NEW' })
    jobs.getJob.mockResolvedValue({ state: 'failed', family: { execution_list: [] } })

    await store.start({
      groupId: 'group-1',
      name: 'counts',
      runtime: 'python-notebook',
      workspaceBucket: 'lab-data',
    })

    expect(store.jobId.value).toBe('')
    expect(notebook.meta.value?.job_id).toBeUndefined()
    expect(store.error.value).toContain('finished before it started a kernel')
    scope.stop()
  })

  it('forgets a session that is gone on reload', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockRejectedValue(new ApiError(404, 'not found'))

    await store.attachSaved()

    expect(store.jobId.value).toBe('')
    expect(store.live.value).toBe(false)
    expect(notebook.meta.value?.job_id).toBeUndefined()
    expect(store.error.value).toContain('no longer running')
    expect(session.openSessionStream).not.toHaveBeenCalled()
    scope.stop()
  })

  it('does not follow a session that already ended', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ state: 'ended', ended: { reason: 'idle' } }))

    await store.attachSaved()

    expect(store.ended.value).toBe(true)
    expect(session.openSessionStream).not.toHaveBeenCalled()
    scope.stop()
  })

  it('resumes at the event this browser last saw', async () => {
    const { notebook, session: store, scope } = await setup()
    writeResumePoint(JSON.stringify(['/api/v1', 'user-a', 'realm-a', 'node-a']), '01JOB', 31)
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ last_event_id: 7 }))

    await store.attachSaved()

    expect(session.openSessionStream.mock.calls[0][0].lastEventId).toBe(31)
    scope.stop()
  })

  it('counts the events of a new session from the start', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    session.stream.emit({ id: 44, type: 'kernel', data: { state: 'idle' } })
    session.endSession.mockResolvedValue({ job_id: '01JOB', state: 'succeeded' })
    await store.end()

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
    })
    session.stream.emit({ id: 2, type: 'kernel', data: { state: 'busy' } })
    // Disposing the scope writes the pending resume point.
    scope.stop()

    // Without the reset the new session's small ids would never be recorded.
    expect(readResumePoint(JSON.stringify(['/api/v1', 'user-a', 'realm-a', 'node-a']), '01NEW')).toBe(2)
  })

  it('follows one hop when a node names another', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockRejectedValue(
      new ApiError(409, 'session_not_here', 'session_not_here', { executor_node_id: 'node-b' }),
    )

    await store.attachSaved()

    // node-b answers with node-b again; the client must not chase it.
    expect(session.getSessionState).toHaveBeenCalledTimes(2)
    expect(store.error.value).toContain('session_not_here')
    scope.stop()
  })

  it('ends a submitted session it cannot follow', async () => {
    const { session: store, scope } = await setup()
    jobs.submitJob.mockResolvedValue({ job_id: '01NEW' })
    jobs.getJob.mockResolvedValue({ state: 'failed', family: { execution_list: [] } })
    session.endSession.mockRejectedValue(new ApiError(404, 'not found'))
    jobs.cancelJob.mockResolvedValue({ job_id: '01NEW', state: 'cancelled' })

    await store.start({
      groupId: 'group-1',
      name: 'counts',
      runtime: 'python-notebook',
      workspaceBucket: 'lab-data',
    })

    expect(session.endSession).toHaveBeenCalledWith('01NEW', expect.anything())
    expect(jobs.cancelJob).toHaveBeenCalledWith('01NEW', { baseUrl: '/api/v1', token: 'bearer-token' })
    expect(store.jobId.value).toBe('')
    scope.stop()
  })

  it('leaves the job of an earlier session alone when a submit fails', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01OLD', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ job_id: '01OLD', state: 'ended', ended: { reason: 'ended' } }))
    await store.attachSaved()
    jobs.submitJob.mockRejectedValue(new ApiError(503, 'job_placement_unavailable'))

    await store.start({
      groupId: 'group-1',
      name: 'counts',
      runtime: 'python-notebook',
      workspaceBucket: 'lab-data',
    })

    expect(session.endSession).not.toHaveBeenCalled()
    expect(jobs.cancelJob).not.toHaveBeenCalled()
    expect(notebook.meta.value?.job_id).toBe('01OLD')
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

  it('preserves saved output when a cell submission is refused', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const cell = notebook.cells.value[0]
    notebook.appendOutput(cell.id, { output_type: 'stream', name: 'stdout', text: 'previous result' })
    cell.execution_count = 4
    session.runSessionCell.mockRejectedValue(new ApiError(429, 'queue full'))

    expect(await store.runCell(cell.id, 'print(1)')).toBe(false)
    expect(cell.outputs).toEqual([{ output_type: 'stream', name: 'stdout', text: 'previous result' }])
    expect(cell.execution_count).toBe(4)
    scope.stop()
  })

  it.each(['interrupt', 'end'] as const)('stops remaining submissions on %s', async (action) => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    let finish = () => {}
    session.runSessionCell.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    const running = store.runCells([{ id: 'first', source: '1' }, { id: 'second', source: '2' }])
    await store[action]()
    finish()
    await running
    expect(session.runSessionCell).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('waits and resends a cell the node rate limited', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const cell = notebook.cells.value[0]
    session.runSessionCell
      .mockRejectedValueOnce(new ApiError(429, 'Too many requests.', 'rate_limited', {}, 0))
      .mockResolvedValueOnce({ cell_id: cell.id, position: 0 })

    await store.runCells([{ id: cell.id, source: 'print(1)' }])

    expect(session.runSessionCell).toHaveBeenCalledTimes(2)
    expect(store.error.value).toBeNull()
    scope.stop()
  })

  it('stops the run at the cell that failed', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const first = notebook.cells.value[0]
    const second = notebook.addCell('code', undefined, 'print(2)')
    const third = notebook.addCell('code', undefined, 'print(3)')
    session.runSessionCell
      .mockResolvedValueOnce({ cell_id: first.id, position: 0 })
      .mockRejectedValueOnce(new ApiError(409, 'session_ended', 'session_ended'))

    await store.runCells(
      [first, second, third].map((cell) => ({ id: cell.id, source: cell.source })),
    )

    expect(session.runSessionCell).toHaveBeenCalledTimes(2)
    expect(store.error.value).toContain('stopped at cell 2')
    scope.stop()
  })

  it('sends the cells in the order it was given', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    const first = notebook.cells.value[0]
    const second = notebook.addCell('code', undefined, 'print(2)')
    session.runSessionCell.mockResolvedValue({ cell_id: 'x', position: 0 })

    await store.runCells([
      { id: first.id, source: 'print(1)' },
      { id: second.id, source: 'print(2)' },
    ])

    expect(session.runSessionCell.mock.calls.map((call) => call[1].cell_id)).toEqual([
      first.id,
      second.id,
    ])
    scope.stop()
  })

  it('refuses a cell that is already running', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state({ cells: [{ cell_id: 'c1', state: 'running' }] }))
    await store.attachSaved()
    const cell = notebook.cells.value[0]
    session.getSessionState.mockClear()
    store.cellStates.value = { [cell.id]: { cell_id: cell.id, state: 'running' } }

    expect(await store.runCell(cell.id, 'print(1)')).toBe(false)
    expect(session.runSessionCell).not.toHaveBeenCalled()
    expect(store.error.value).toContain('already running')
    scope.stop()
  })

  it('ends and interrupts through the executing node', async () => {
    const { notebook, session: store, scope } = await setup()
    notebook.patchMeta({ job_id: '01JOB', executor_node_id: 'node-a' })
    session.getSessionState.mockResolvedValue(state())
    await store.attachSaved()
    session.interruptSession.mockResolvedValue(undefined)
    session.endSession.mockResolvedValue({ job_id: '01JOB', state: 'succeeded' })

    await store.interrupt()
    await store.end()

    expect(session.interruptSession).toHaveBeenCalledWith('01JOB', {
      baseUrl: 'https://node-a.example/api/v1',
      token: 'bearer-token',
    })
    expect(store.ended.value).toBe(true)
    expect(store.live.value).toBe(false)
    scope.stop()
  })

  it('reuses the idempotency key after a refused submit', async () => {
    const { session: store, scope } = await setup()
    jobs.submitJob.mockRejectedValueOnce(new ApiError(503, 'job_placement_unavailable'))
    jobs.submitJob.mockResolvedValueOnce({ job_id: '01NEW' })
    jobs.getJob.mockResolvedValue({
      state: 'running',
      family: { execution_list: [{ executor_node_id: 'node-a', canonical: true }] },
    })
    session.getSessionState.mockResolvedValue(state({ job_id: '01NEW' }))
    const draft = {
      groupId: 'group-1',
      name: 'counts',
      runtime: 'python-notebook',
      workspaceBucket: 'lab-data',
    }

    await store.start(draft)
    await store.start(draft)

    const [first, second] = jobs.submitJob.mock.calls.map((call) => call[0].idempotency_key)
    expect(first).toBeTruthy()
    expect(second).toBe(first)
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
