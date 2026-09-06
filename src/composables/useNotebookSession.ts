// The live session behind the open notebook: start, attach, the event stream,
// and the cell runs. The browser talks to the node that runs the session, so
// every call uses that node's API base.
import { computed, onScopeDispose, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import type { NotebookStore } from '@/composables/useNotebook'
import { getJob, submitErrorMessage, submitJob, type JobStatusResponse } from '@/lib/jobs'
import { ApiError, type ApiClientOptions } from '@/lib/api'
import {
  endSession,
  getSessionState,
  interruptSession,
  openSessionStream,
  runSessionCell,
  sessionAbsent,
  sessionNotHere,
  type KernelState,
  type SessionCell,
  type SessionEvent,
  type SessionState,
  type SessionStream,
} from '@/lib/notebook/session'
import { sessionSubmitRequest, type SessionSubmitDraft } from '@/lib/notebook/submit'
import { clearResumePoint, readResumePoint, writeResumePoint } from '@/lib/notebook/document'
import { trailing } from '@/lib/throttle'
import { errorMessage } from '@/lib/utils'

/** Attempts to learn which node runs the job, before the stream can open. */
const NODE_LOOKUP_TRIES = 20
const NODE_LOOKUP_DELAY_MS = 1_500

function executorNode(job: JobStatusResponse): string {
  const executions = job.family?.execution_list ?? []
  const canonical = executions.find((execution) => execution.canonical) ?? executions[0]
  return canonical?.executor_node_id ?? ''
}

/** The submit, plus the dependency file the portal writes before it. */
export interface SessionStartDraft extends SessionSubmitDraft {
  dependencyText?: string
}

export function createNotebookSession(notebook: NotebookStore) {
  const { apiBaseUrl, authToken } = useAruna()
  const s3 = useS3()
  const { nodeById } = useRealmNodes()

  const jobId = ref(notebook.meta.value?.job_id ?? '')
  const nodeId = ref(notebook.meta.value?.executor_node_id ?? '')
  const state = ref<SessionState | null>(null)
  const kernel = ref<KernelState>('starting')
  const cellStates = ref<Record<string, SessionCell>>({})
  const starting = ref(false)
  const ending = ref(false)
  const attaching = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const streamOpen = ref(false)
  /** A shorter idle timeout than the realm's, picked in the session bar. */
  const idlePickMs = ref<number | null>(null)

  let stream: SessionStream | null = null
  // Stopped work must not keep polling for a node after the page is gone.
  let disposed = false
  let seenEventId = 0
  // A busy cell sends many events; the resume point is written on a timer.
  const keepResumePoint = trailing(() => {
    if (jobId.value && seenEventId) writeResumePoint(jobId.value, seenEventId)
  }, 1_000)

  const homeClient = computed<ApiClientOptions>(() => ({
    baseUrl: apiBaseUrl.value,
    token: authToken.value,
  }))
  // The session routes are served by the executing node alone.
  const client = computed<ApiClientOptions>(() => ({
    baseUrl: (nodeId.value ? nodeById(nodeId.value)?.apiBase : null) ?? apiBaseUrl.value,
    token: authToken.value,
  }))

  const live = computed(() => state.value?.state === 'ready' || state.value?.state === 'busy')
  const ended = computed(() => state.value?.state === 'ended')
  const running = computed(() => Boolean(jobId.value) && !ended.value)

  function closeStream() {
    stream?.close()
    stream = null
    streamOpen.value = false
  }

  function applyEvent(event: SessionEvent) {
    if (event.id > seenEventId) {
      seenEventId = event.id
      keepResumePoint.schedule()
    }
    if (event.type === 'session') {
      state.value = { cells: state.value?.cells ?? [], ...event.data }
      return
    }
    if (event.type === 'kernel') {
      kernel.value = event.data.state
      return
    }
    if (event.type === 'cell') {
      const cell = event.data
      cellStates.value = { ...cellStates.value, [cell.cell_id]: cell }
      if (cell.state === 'done' || cell.state === 'error') {
        notebook.noteCellRun(cell.cell_id, {
          execution_count: cell.execution_count,
          started_at_ms: cell.started_at_ms,
          finished_at_ms: cell.finished_at_ms,
          job_id: jobId.value,
        })
      }
      return
    }
    if (event.type === 'output') {
      notebook.appendOutput(event.data.cell_id, event.data.output)
      return
    }
    if (event.type === 'credential') {
      if (state.value) state.value.credential_expires_at_ms = event.data.expires_at_ms
      return
    }
    if (event.type === 'gap') {
      notice.value = 'Some output was dropped while this page was away; the cells that were running may be incomplete.'
      void refresh()
      return
    }
    // ended
    notice.value = `The session ended (${event.data.reason}).`
    clearResumePoint(jobId.value)
    if (state.value) state.value = { ...state.value, state: 'ended', ended: event.data }
    kernel.value = 'dead'
    closeStream()
  }

  function openStream() {
    closeStream()
    if (!jobId.value) return
    stream = openSessionStream({
      jobId: jobId.value,
      client: () => client.value,
      // What this browser saw wins; the node's figure is the fallback.
      lastEventId: readResumePoint(jobId.value) || state.value?.last_event_id,
      onEvent: applyEvent,
      onOpen: () => {
        streamOpen.value = true
        error.value = null
      },
      onError: onStreamError,
    })
  }

  /** What a broken connection means: gone, moved, refused, or worth retrying. */
  function onStreamError(cause: unknown) {
    streamOpen.value = false
    if (sessionAbsent(cause)) {
      forget('That session is no longer running.')
      return
    }
    const elsewhere = sessionNotHere(cause)
    if (elsewhere) {
      nodeId.value = elsewhere
      notebook.patchMeta({ executor_node_id: elsewhere })
      openStream()
      return
    }
    if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
      closeStream()
      error.value = 'This session refused the connection. Sign in again and reopen the notebook.'
      return
    }
    error.value = `The session stream stopped: ${errorMessage(cause)}`
  }

  /** Drops the session for good, so the bar offers Start again. */
  function forget(reason?: string) {
    detach()

    notebook.patchMeta({ job_id: undefined, executor_node_id: undefined })
    if (reason) error.value = reason
  }

  /** Reads the session state again, following the node that answers for it. */
  async function refresh(): Promise<boolean> {
    if (!jobId.value) return false
    try {
      const next = await getSessionState(jobId.value, client.value)
      state.value = next
      cellStates.value = Object.fromEntries(next.cells.map((cell) => [cell.cell_id, cell]))
      if (next.executor_node_id && next.executor_node_id !== nodeId.value) {
        nodeId.value = next.executor_node_id
        notebook.patchMeta({ executor_node_id: next.executor_node_id })
      }
      return true
    } catch (cause) {
      const elsewhere = sessionNotHere(cause)
      if (elsewhere && elsewhere !== nodeId.value) {
        nodeId.value = elsewhere
        notebook.patchMeta({ executor_node_id: elsewhere })
        return refresh()
      }
      if (sessionAbsent(cause)) {
        forget('That session is no longer running.')
        return false
      }
      error.value = errorMessage(cause)
      return false
    }
  }

  /** Picks up the session the notebook names, once the document is read. */
  async function attachSaved(): Promise<void> {
    const meta = notebook.meta.value
    if (!meta?.job_id) return
    jobId.value = meta.job_id
    nodeId.value = meta.executor_node_id ?? ''
    await attach()
  }

  /** Reattaches to the session, after a reload or a node change. */
  async function attach(): Promise<void> {
    if (!jobId.value || attaching.value) return
    attaching.value = true
    error.value = null
    try {
      if (!nodeId.value) await findNode()
      if (await refresh()) openStream()
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      attaching.value = false
    }
  }

  async function findNode(): Promise<void> {
    for (let attempt = 0; attempt < NODE_LOOKUP_TRIES && !disposed; attempt += 1) {
      const job = await getJob(jobId.value, homeClient.value)
      const found = executorNode(job)
      if (found) {
        nodeId.value = found
        notebook.patchMeta({ executor_node_id: found })
        return
      }
      if (['succeeded', 'failed', 'cancelled'].includes(job.state)) {
        throw new Error('The session job finished before it started a kernel.')
      }
      await new Promise((resolve) => setTimeout(resolve, NODE_LOOKUP_DELAY_MS))
    }
    if (disposed) return
    throw new Error('No node reported that it runs this session yet.')
  }

  async function start(draft: SessionStartDraft): Promise<void> {
    if (starting.value || running.value) return
    starting.value = true
    error.value = null
    notice.value = null
    try {
      // The session stages this file from the bucket, so it must exist first.
      if (draft.dependencyKey && draft.dependencyKind && draft.dependencyText?.trim()) {
        await s3.putTextObject(
          draft.workspaceBucket,
          draft.dependencyKey,
          draft.dependencyText,
          'text/plain',
        )
      }
      const request = sessionSubmitRequest({
        ...draft,
        ...(idlePickMs.value ? { idleAfterMs: idlePickMs.value } : {}),
      })
      const created = await submitJob(request, homeClient.value)
      jobId.value = created.job_id
      nodeId.value = ''
      state.value = null
      kernel.value = 'starting'
      cellStates.value = {}
      notebook.patchMeta({ job_id: created.job_id })
      await findNode()
      await refresh()
      openStream()
    } catch (cause) {
      const message = submitErrorMessage(cause)
      // A job that was admitted but cannot be followed must not block Start.
      if (jobId.value) forget()
      error.value = message
    } finally {
      starting.value = false
    }
  }

  async function end(): Promise<void> {
    if (!jobId.value || ending.value) return
    ending.value = true
    try {
      await endSession(jobId.value, client.value)
      closeStream()
      clearResumePoint(jobId.value)
      if (state.value) state.value = { ...state.value, state: 'ended', ended: { reason: 'ended' } }
      kernel.value = 'dead'
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      ending.value = false
    }
  }

  async function interrupt(): Promise<void> {
    if (!jobId.value) return
    try {
      await interruptSession(jobId.value, client.value)
    } catch (cause) {
      error.value = errorMessage(cause)
    }
  }

  /** Sends one cell to the kernel; its outputs arrive on the stream. */
  async function runCell(cellId: string, code: string): Promise<boolean> {
    if (!jobId.value || !live.value) return false
    notebook.clearOutputs(cellId)
    cellStates.value = { ...cellStates.value, [cellId]: { cell_id: cellId, state: 'queued' } }
    try {
      await runSessionCell(jobId.value, { cell_id: cellId, code }, client.value)
      return true
    } catch (cause) {
      const next = { ...cellStates.value }
      delete next[cellId]
      cellStates.value = next
      error.value = errorMessage(cause)
      return false
    }
  }

  /** Sends the cells in order; the node keeps the queue. */
  async function runCells(cells: { id: string; source: string }[]): Promise<void> {
    for (const cell of cells) {
      const sent = await runCell(cell.id, cell.source)
      if (!sent) return
    }
  }

  function detach(): void {
    closeStream()
    keepResumePoint.cancel()
    if (jobId.value) clearResumePoint(jobId.value)
    seenEventId = 0
    jobId.value = ''
    nodeId.value = ''
    state.value = null
    cellStates.value = {}
  }

  onScopeDispose(() => {
    disposed = true
    keepResumePoint.flush()
    closeStream()
  })

  return {
    jobId,
    nodeId,
    state,
    kernel,
    cellStates,
    starting,
    ending,
    attaching,
    error,
    notice,
    streamOpen,
    idlePickMs,
    client,
    live,
    ended,
    running,
    attach,
    attachSaved,
    refresh,
    start,
    end,
    interrupt,
    runCell,
    runCells,
    detach,
  }
}

export type NotebookSessionStore = ReturnType<typeof createNotebookSession>
