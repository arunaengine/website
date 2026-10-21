// Short words for the organize steps, kept apart from the components so tests reach them.
import {
  ApiError,
  type BackendImport,
  type BackendImportRenames,
  type LinkStatus,
  type OrganizeJob,
  type OrganizeKind,
} from '@/lib/api'
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

/** The job as the progress box shows it; null once it is over. */
export function activeJob(job: OrganizeJob | null): ProgressJob | null {
  return job && (job.state === 'running' || job.state === 'paused') ? { ...job, state: job.state } : null
}

/** A short message for a refused organize call. */
export function organizeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Only group admins with write access to the bucket can do this.'
    if (err.status === 409 && err.code === 'job_running') return 'Another step is running.'
  }
  return errorMessage(err)
}

/** What is wrong with a move request, or null. */
export function moveProblem(request: { pattern: string; target: string }): string | null {
  if (!request.pattern.trim()) return 'Add a file name, such as *.faa.gz.'
  if (!request.target.includes('{name}')) return 'The new name needs {name}, such as proteins/{name}.'
  if (request.target.startsWith('/')) return 'The new name cannot start with /.'
  return null
}

export interface LinkProblem {
  id: string
  /** A plain sentence with the next step. */
  text: string
  /** Show opens the details on the card; Organize opens the panel. */
  action: 'show' | 'organize'
}

/** Every file the last run did not add, with its own reason: the node's list, else the run's. */
export function failureList(link: BackendImport, conflicts: { path: string; reason: string }[]): { path: string; reason: string }[] {
  if (conflicts.length) return conflicts
  return (link.last_run?.errors ?? []).map((failure) => ({ path: failure.key, reason: failure.error }))
}

/** The problems of one link as plain sentences, most urgent first. */
export function linkProblems(
  link: BackendImport,
  renames: BackendImportRenames | null,
  status: LinkStatus | null,
): LinkProblem[] {
  const found: LinkProblem[] = []
  const run = link.last_run
  if (run?.error) {
    found.push({ id: 'stopped', text: `The last run stopped: ${run.error} Run it again, or check your storage.`, action: 'show' })
  }
  // The status lists the same files as the run, each with its reason: one problem, told once.
  const failed = run?.failed || (status?.conflicts.length ?? 0)
  if (failed) {
    found.push({
      id: 'failed',
      text: `${filesWord(failed)} could not be added. Choose Show to see why.`,
      action: 'show',
    })
  }
  if (renames && renames.count > 0) {
    found.push({
      id: 'renames',
      text: `${renames.complete ? '' : 'At least '}${filesWord(renames.count)} still ${renames.count === 1 ? 'has' : 'have'} the old name. Rename them in Organize.`,
      action: 'organize',
    })
  }
  return found
}

/** A row identity for a duplicate group: one key can hold several contents. */
export function copyKey(item: { key: string; kept: { path: string }; removed: { path: string }[] }): string {
  return [item.key, item.kept.path, ...item.removed.map((file) => file.path)].join('\n')
}
