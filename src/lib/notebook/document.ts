// Where a notebook and its files live in the workspace bucket, and the working
// copy the browser keeps between saves. Every PUT is a kept version, so the
// portal saves on demand and at most every five minutes.
import { dependencyFileName } from './runtimes'

export const NOTEBOOK_PREFIX = 'notebooks/'
export const NOTEBOOK_SUFFIX = '.ipynb'
export const NOTEBOOK_DATA_PREFIX = 'data/'
export const AUTOSAVE_INTERVAL_MS = 300_000

export function notebookKey(name: string): string {
  return `${NOTEBOOK_PREFIX}${name}${NOTEBOOK_SUFFIX}`
}

/** The name inside the key, used for the file names beside the notebook. */
export function notebookName(key: string): string {
  const base = key.split('/').filter(Boolean).pop() ?? key
  return isNotebookKey(base) ? base.slice(0, -NOTEBOOK_SUFFIX.length) : base
}

export function isNotebookKey(key: string): boolean {
  return key.toLowerCase().endsWith(NOTEBOOK_SUFFIX)
}

/** Key of the dependency list the session stages, beside the notebook. */
export function dependencyKey(name: string, kind: 'requirements' | 'deno'): string {
  return `${NOTEBOOK_PREFIX}${name}.${dependencyFileName(kind)}`
}

/** A file name that is safe as an object key segment. */
export function notebookSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'notebook'
  )
}

// ── Working copy ─────────────────────────────────────────────────────────────
// Unsaved edits live in this browser only, keyed by bucket and key, so a reload
// or a lost connection does not drop them.

const WORKING_COPY_PREFIX = 'aruna.notebook.'

export interface WorkingCopy {
  text: string
  changed_at_ms: number
}

export function workingCopyKey(scope: string, bucket: string, key: string): string {
  return `${WORKING_COPY_PREFIX}${JSON.stringify([scope, bucket, key])}`
}

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readWorkingCopy(scope: string, bucket: string, key: string): WorkingCopy | null {
  try {
    const raw = store()?.getItem(workingCopyKey(scope, bucket, key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkingCopy
    if (typeof parsed?.text !== 'string') return null
    return { text: parsed.text, changed_at_ms: Number(parsed.changed_at_ms) || 0 }
  } catch {
    return null
  }
}

export function writeWorkingCopy(scope: string, bucket: string, key: string, text: string, nowMs: number): void {
  try {
    const copy: WorkingCopy = { text, changed_at_ms: nowMs }
    store()?.setItem(workingCopyKey(scope, bucket, key), JSON.stringify(copy))
  } catch {
    // A full or blocked store only costs the unsaved copy, never the notebook.
  }
}

export function clearWorkingCopy(scope: string, bucket: string, key: string): void {
  try {
    store()?.removeItem(workingCopyKey(scope, bucket, key))
  } catch {
    // Nothing to do; the next save overwrites it.
  }
}

// ── Resume point ─────────────────────────────────────────────────────────────
// The last event id this browser saw for one session job, so a reload picks the
// stream up where it left off instead of at the state the node reports now.

const RESUME_PREFIX = 'aruna.notebook.resume.'

export function readResumePoint(scope: string, jobId: string): number {
  try {
    const raw = store()?.getItem(`${RESUME_PREFIX}${JSON.stringify([scope, jobId])}`)
    const id = Number(raw)
    return Number.isSafeInteger(id) && id > 0 ? id : 0
  } catch {
    return 0
  }
}

export function writeResumePoint(scope: string, jobId: string, eventId: number): void {
  try {
    store()?.setItem(`${RESUME_PREFIX}${JSON.stringify([scope, jobId])}`, String(eventId))
  } catch {
    // Without it a reload resumes at the state the node reports.
  }
}

export function clearResumePoint(scope: string, jobId: string): void {
  try {
    store()?.removeItem(`${RESUME_PREFIX}${JSON.stringify([scope, jobId])}`)
  } catch {
    // Nothing to do; a stale point only replays events the node still holds.
  }
}

/** True when a changed notebook is due for its automatic save. */
export function autosaveDue(changedAtMs: number | null, lastSavedMs: number, nowMs: number): boolean {
  if (!changedAtMs) return false
  return nowMs - Math.max(lastSavedMs, 0) >= AUTOSAVE_INTERVAL_MS
}
