// Short words for the organize steps, kept apart from the components so tests reach them.
import type { BackendImport, BackendImportRenames, LinkStatus, OrganizeJob, OrganizeKind } from '@/lib/api'
import { formatNumber } from '@/lib/utils'

export function filesWord(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? 'file' : 'files'}`
}

/** "1-100 of 214,880", or "0 files" when the list is empty. */
export function rangeLabel(offset: number, shown: number, total: number): string {
  if (!total || !shown) return 'No files'
  return `${formatNumber(offset + 1)}-${formatNumber(offset + shown)} of ${formatNumber(total)}`
}

const TITLES: Record<OrganizeKind, { running: string; abort: string }> = {
  move: { running: 'Moving files', abort: 'Abort moving files?' },
  rename: { running: 'Renaming files in your storage', abort: 'Abort renaming files?' },
  duplicates: { running: 'Removing stored copies', abort: 'Abort removing copies?' },
}

export function jobTitle(job: OrganizeJob): string {
  const title = TITLES[job.kind].running
  return job.state === 'paused' ? `${title} (paused)` : title
}

export function abortTitle(job: OrganizeJob): string {
  return TITLES[job.kind].abort
}

export function abortSentence(job: OrganizeJob): string {
  const rest = Math.max(job.total - job.done, 0)
  const kept =
    job.kind === 'duplicates'
      ? `The other ${formatNumber(rest)} stay as they are.`
      : `The other ${formatNumber(rest)} keep their names.`
  const verb = job.kind === 'duplicates' ? 'removed' : job.kind === 'rename' ? 'renamed' : 'moved'
  return `${filesWord(job.done)} ${job.done === 1 ? 'is' : 'are'} already ${verb} and stay ${verb}. ${kept} You can start again later.`
}

export function percent(job: OrganizeJob): number {
  return job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0
}

export function isActive(job: OrganizeJob | null): job is OrganizeJob {
  return job !== null && (job.state === 'running' || job.state === 'paused')
}

/** The running physical rename as a job; its total is what was moved plus what is left. */
export function renameJob(found: BackendImportRenames | null): OrganizeJob | null {
  const progress = found?.progress
  if (!found || !progress || progress.finished_at_ms != null) return null
  return {
    kind: 'rename',
    state: 'running',
    done: progress.migrated,
    total: progress.migrated + found.count,
    skipped: progress.skipped,
    controls: false,
  }
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
  if (run?.failed) {
    found.push({
      id: 'failed',
      text: `${filesWord(run.failed)} could not be added. Run again; if it stays, check the list.`,
      action: 'show',
    })
  }
  const conflicts = status?.conflicts ?? []
  if (conflicts.length) {
    found.push({
      id: 'conflicts',
      text: `${filesWord(conflicts.length)} ${conflicts.length === 1 ? 'needs' : 'need'} a decision. Two links claim ${conflicts.length === 1 ? 'it' : 'them'}. Add a file rule to choose one.`,
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
