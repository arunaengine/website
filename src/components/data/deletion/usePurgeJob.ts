// One fenced storage purge, from submission to a terminal state. Progress from
// completed batches is retained so a failure still shows what was committed.
import { ref } from 'vue'
import {
  getStoragePurgeJob,
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
  let runId = 0

  function reset() {
    ++runId
    submission.value = null
    status.value = null
    progress.value = null
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
        throw new Error(`System job ${started.job_id} is not a storage purge.`)
      }
      status.value = next
      progress.value = retainStoragePurgeProgress(progress.value, next.progress)
      if (isTerminalStoragePurgeJob(next.state)) return next
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      if (id !== runId) return null
    }
  }

  return { submission, status, progress, reset, run }
}

export type PurgeJob = ReturnType<typeof usePurgeJob>
