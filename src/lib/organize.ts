// Short words for the organize steps, kept apart from the components so tests reach them.
import { ApiError, type BucketJob, type OrganizeJob, type OrganizeKind } from '@/lib/api'
import { errorMessage, formatNumber } from '@/lib/utils'

export function filesWord(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? 'file' : 'files'}`
}

/** "1-100 of 214,880", with "at least" while the count is a lower bound. */
export function rangeLabel(offset: number, shown: number, total: number, complete = true): string {
  if (!total || !shown) return 'No files'
  const count = `${formatNumber(offset + 1)}-${formatNumber(offset + shown)} of ${complete ? '' : 'at least '}${formatNumber(total)}`
  return count
}

/** What the progress box needs, from an organize step or a permanent delete. */
export interface ProgressJob {
  kind: OrganizeKind | 'purge'
  state: 'running' | 'paused'
  done: number
  /** Zero when the step reports no total. */
  total: number
  /** The total is final. */
  counted: boolean
  skipped: number
  failed: number
  waiting?: boolean | string | null
  controls: boolean
  started_at_ms?: number
  /** Time left as a short phrase, when it can be told. */
  left?: string | null
}

const TITLES: Record<ProgressJob['kind'], { running: string; abort: string; verb: string }> = {
  move: { running: 'Moving files', abort: 'Abort moving files?', verb: 'moved' },
  rename: { running: 'Renaming files in your storage', abort: 'Abort renaming files?', verb: 'renamed' },
  duplicates: { running: 'Removing stored copies', abort: 'Abort removing copies?', verb: 'removed' },
  purge: { running: 'Deleting permanently', abort: 'Abort deleting?', verb: 'deleted' },
}

export function jobTitle(job: ProgressJob): string {
  const title = TITLES[job.kind].running
  return job.state === 'paused' ? `${title} (paused)` : title
}

export function abortTitle(job: ProgressJob): string {
  return TITLES[job.kind].abort
}

export function abortSentence(job: ProgressJob): string {
  const verb = TITLES[job.kind].verb
  const done = `${filesWord(job.done)} ${job.done === 1 ? 'is' : 'are'} already ${verb} and stay ${verb}.`
  if (!job.total) return `${done} You can start again later.`
  const rest = Math.max(job.total - job.done, 0)
  const kept = job.kind === 'move' || job.kind === 'rename' ? 'keep their names' : 'stay as they are'
  return `${done} The other ${formatNumber(rest)} ${kept}. You can start again later.`
}

export function percent(job: ProgressJob): number {
  return job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0
}

const LEFT_AFTER = 5

/** "about 40 min left" from the speed so far; null while paused, early on or without a total. */
export function timeLeft(job: ProgressJob, now: number): string | null {
  const handled = job.done + job.failed
  const spent = now - (job.started_at_ms ?? now)
  if (job.state !== 'running' || handled < LEFT_AFTER || spent <= 0 || job.total <= handled) return null
  const minutes = ((job.total - handled) * spent) / handled / 60_000
  const rounded = Math.round(minutes)
  if (rounded < 1) return 'less than 1 min left'
  return rounded < 60 ? `about ${rounded} min left` : `about ${formatNumber(Math.round(minutes / 60))} h left`
}

/** The job as the progress box shows it; null once it is over. */
export function activeJob(job: OrganizeJob | null): ProgressJob | null {
  return job && (job.state === 'running' || job.state === 'paused') ? { ...job, state: job.state } : null
}

const BUCKET_STEPS: Record<BucketJob['kind'], string> = {
  rename: 'Renaming',
  move: 'Moving',
  compression: 'Compressing',
  encryption: 'Encrypting',
  duplicates: 'Removing copies',
  key_move: 'Moving keys',
  check: 'Checking',
  purge: 'Deleting',
  import: 'Importing',
}

/** "Renaming", or "Renaming (paused)", for a step in a bucket list. */
export function bucketJobLabel(job: BucketJob): string {
  const label = BUCKET_STEPS[job.kind] ?? 'Working'
  return job.state === 'paused' ? `${label} (paused)` : label
}

/** A short message for a refused organize call. */
export function organizeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Only group admins with write access to the bucket can do this.'
    if (err.status === 409 && err.code === 'job_running') return 'Another step is running.'
  }
  return errorMessage(err)
}

/** A row identity for a duplicate group: one key can hold several contents. */
export function copyKey(item: { key: string; kept: { path: string }; removed: { path: string }[] }): string {
  return [item.key, item.kept.path, ...item.removed.map((file) => file.path)].join('\n')
}
