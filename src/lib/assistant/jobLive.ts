// What a background watcher last saw of a job, so a job card in the
// conversation stays current between model turns. Nothing here is persisted:
// a reload leaves the cards on the facts the transcript holds.
import { reactive } from 'vue'

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
