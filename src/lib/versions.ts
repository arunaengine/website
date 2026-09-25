// Display rules for the dataset History tab: values, property changes, authors
// and the error codes of the versions API.
import { ApiError, type DatasetBranch, type DatasetVersion, type PropertyChange } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export const NO_VALUE = 'no value'

/** One JSON value as text; links show their id. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return NO_VALUE
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>)['@id']
    if (typeof id === 'string' && Object.keys(value).length === 1) return id
  }
  return JSON.stringify(value)
}

export interface PropertyRow {
  name: string
  /** Several values on a side: the columns list removed and added items. */
  multiple: boolean
  before: string[]
  after: string[]
}

// Values compare as sets, so a multi-valued property shows only what changed.
export function propertyRow(property: PropertyChange): PropertyRow {
  const before = property.before.map(valueText)
  const after = property.after.map(valueText)
  if (before.length <= 1 && after.length <= 1) {
    return { name: property.name, multiple: false, before: before.length ? before : [NO_VALUE], after: after.length ? after : [NO_VALUE] }
  }
  return {
    name: property.name,
    multiple: true,
    before: before.filter((value) => !after.includes(value)),
    after: after.filter((value) => !before.includes(value)),
  }
}

/** The name to show for a version's author; resolved names win for node-made versions. */
export function authorName(version: DatasetVersion, resolved?: string | null): string {
  if (version.author.user_id && resolved) return resolved
  return version.author.name
}

export function shortVersion(version: string): string {
  return version.slice(0, 8)
}

// main first, then drafts by name, then other protected lines such as aruna.
export function sortBranches(branches: DatasetBranch[]): DatasetBranch[] {
  const rank = (branch: DatasetBranch) => (branch.name === 'main' ? 0 : branch.protected ? 2 : 1)
  return [...branches].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

export function branchLabel(branch: DatasetBranch): string {
  if (branch.name === 'main') return 'main (live metadata)'
  return branch.protected ? `${branch.name} (read only)` : branch.name
}

export type HistoryProblem = 'missing' | 'not-holder' | 'unsupported' | 'forbidden' | 'error'

// A 404 without a versions code comes from a node that predates these routes.
export function historyProblem(err: unknown): HistoryProblem {
  if (!(err instanceof ApiError)) return 'error'
  if (err.code === 'branch_missing') return 'missing'
  if (err.code === 'not_holder') return 'not-holder'
  if (err.status === 401 || err.status === 403) return 'forbidden'
  if (!err.code && [404, 405, 501].includes(err.status)) return 'unsupported'
  return 'error'
}

/** Message for a failed write, by the error codes of the versions API. */
export function writeMessage(err: unknown, target = 'The branch'): string {
  if (!(err instanceof ApiError)) return errorMessage(err)
  if (err.status === 412 || err.code === 'stale') return `${target} changed. Reload and try again.`
  if (err.code === 'exists') return 'A branch or tag with this name already exists.'
  if (err.code === 'locked') return 'Another change is being saved. Try again in a moment.'
  if (err.code === 'not_found') return 'The version or name was not found. Reload and try again.'
  if (err.status === 403) return 'You do not have write access to this dataset.'
  if (err.code === 'git_unavailable' || err.status === 503) return 'History is not available right now. Try again later.'
  return errorMessage(err)
}
