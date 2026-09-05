// What a watcher or a card last read of a job, so a job card in the
// conversation stays current between model turns. Nothing here is persisted:
// after a reload a card reads its job once and the watcher polls on from there.
import { reactive } from 'vue'
import type { JobStatusResponse } from '@/lib/jobs'

export interface JobLive {
  state: string
  kind?: string
  attempts?: number
  startedAt?: string
  finishedAt?: string
  error?: string
}

const seen = reactive(new Map<string, JobLive>())
const watched = reactive(new Set<string>())

export function liveJob(jobId: string): JobLive | undefined {
  return seen.get(jobId)
}

export function noteJob(jobId: string, facts: JobLive): void {
  if (jobId) seen.set(jobId, facts)
}

/** The facts a card shows, picked out of a job status. */
export function jobFacts(job: JobStatusResponse): JobLive {
  return {
    state: job.state,
    kind: job.kind,
    attempts: job.attempts,
    finishedAt: job.finished_at,
    error: job.error?.message,
  }
}

/** True while a watcher follows this job, which is what the card's spinner means. */
export function jobWatched(jobId: string): boolean {
  return watched.has(jobId)
}

export function setWatchedJobs(ids: Iterable<string>): void {
  const next = new Set(ids)
  for (const id of watched) if (!next.has(id)) watched.delete(id)
  for (const id of next) watched.add(id)
}

export function clearLiveJobs(): void {
  seen.clear()
  watched.clear()
}
