// One fenced storage purge, from submission to a terminal state. Progress from
// completed batches is retained so a failure still shows what was committed.
import { ref } from 'vue'
import {
  controlStoragePurge,
  getStoragePurgeJob,
  getStoragePurgeState,
  purgePauseOf,
  isTerminalStoragePurgeJob,
  retainStoragePurgeProgress,
  startStoragePurge,
  type StoragePurgeJobStatus,
  type StoragePurgeOperation,
  type StoragePurgeProgress,
  type StoragePurgeSubmission,
} from '@/lib/storageDeletion'
import type { ApiClientOptions } from '@/lib/api'

const POLL_INTERVAL_MS = 1_000

export function usePurgeJob() {
  const submission = ref<StoragePurgeSubmission | null>(null)
  const status = ref<StoragePurgeJobStatus | null>(null)
  const progress = ref<StoragePurgeProgress | null>(null)
  // The node's `paused` field wins; until it says, a pause the node accepted counts.
  const paused = ref(false)
  // False once the node lacks the state route; the pause is then tracked here.
  let stateRoute = true
  let runId = 0

  function reset() {
    ++runId
    submission.value = null
    status.value = null
    progress.value = null
    paused.value = false
    stateRoute = true
  }

  // The node's own pause word; a node without the route keeps the local tracking.
  async function readState(jobId: string, client: ApiClientOptions, id: number) {
    if (!stateRoute) return
    try {
      const answer = await getStoragePurgeState(jobId, client)
      const word = purgePauseOf(answer)
      if (id === runId && word !== null) paused.value = word
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 404 || status === 405 || status === 501) stateRoute = false
    }
  }

  /** Resolves with the terminal status, or null when a newer run took over. */
  async function run(
    operation: StoragePurgeOperation,
    client: ApiClientOptions,
  ): Promise<StoragePurgeJobStatus | null> {
    reset()
    const id = runId
    const started = await startStoragePurge(operation, client)
    if (id !== runId) return null
    submission.value = started
    for (;;) {
      const next = await getStoragePurgeJob(started.job_id, client)
      if (id !== runId) return null
      if (next.kind !== 'storage_purge') {
        throw new Error(`System job ${started.job_id} is not a permanent deletion.`)
      }
      status.value = next
      if (typeof next.paused === 'boolean') paused.value = next.paused
      else await readState(started.job_id, client, id)
      progress.value = retainStoragePurgeProgress(progress.value, next.progress)
      if (isTerminalStoragePurgeJob(next.state)) return next
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      if (id !== runId) return null
    }
  }

  /** Pauses, resumes or aborts the running delete; the poll shows the new state. */
  async function control(action: 'pause' | 'resume' | 'abort', client: ApiClientOptions) {
    if (!submission.value) return
    const id = runId
    const answer = await controlStoragePurge(submission.value.job_id, action, client)
    // A newer run owns the pause state now.
    if (id !== runId) return
    const word = purgePauseOf(answer)
    if (word !== null) paused.value = word
    else if (action === 'pause') paused.value = true
    else if (action === 'resume') paused.value = false
  }

  return { submission, status, progress, paused, reset, run, control }
}

export type PurgeJob = ReturnType<typeof usePurgeJob>
