// What a watcher or a card last read of a job, so a job card in the
// conversation stays current between model turns. Nothing here is persisted:
// after a reload a card reads its job once and the watcher polls on from there.
import { reactive } from 'vue'
import type { JobStatusResponse } from '@/lib/jobs'
import { formatCount } from '@/lib/formatCount'
import { formatBytes, formatDateTime, formatDuration } from '@/lib/utils'

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

const SETTLED = new Set(['succeeded', 'failed', 'cancelled'])

export interface JobTiming {
  settled: boolean
  /** The one time a job card names: finished, else started, else submitted. */
  when: { label: string; at: string } | null
  /** How long a settled job ran; empty when a time is missing. */
  took: string
}

export function jobTiming(job: { state: string; submittedAt?: string; startedAt?: string; finishedAt?: string }): JobTiming {
  const settled = SETTLED.has(job.state)
  const when = settled && job.finishedAt
    ? { label: 'Finished', at: job.finishedAt }
    : job.startedAt
      ? { label: 'Started', at: job.startedAt }
      : job.submittedAt ? { label: 'Submitted', at: job.submittedAt } : null
  const took = settled && job.startedAt && job.finishedAt
    ? formatDuration(Date.parse(job.finishedAt) - Date.parse(job.startedAt))
    : ''
  return { settled, when: when && formatDateTime(when.at) ? when : null, took }
}

/** "3 files, 1.2 MB"; the size only when every file names one. */
export function outputSummary(outputs: Array<{ size?: number }>): string {
  const files = `${formatCount(outputs.length)}\u00a0${outputs.length === 1 ? 'file' : 'files'}`
  if (!outputs.every((output) => output.size !== undefined)) return files
  const total = outputs.reduce((sum, output) => sum + (output.size ?? 0), 0)
  return `${files}, ${formatBytes(total).replace(' ', '\u00a0')}`
}
