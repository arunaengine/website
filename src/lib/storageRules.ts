// Wording and checks for the rules of a group's storage: the default rule and linked buckets.
import { ApiError, type BackendImport, type BackendImportRun, type BucketMoveResponse, type GroupBackendResponse } from './api'
import { backendSchema } from './storage'
import { storeName, writesInside } from './linkedFolders'
import { formatNumber, relativeTime } from './utils'

/** Keys on group storages are at most this long; a folder must leave room for a file. */
export const MAX_KEY_BYTES = 1024
const NAME_ROOM = 28
// The node counts a run as going on until it ends, as `is_running` in groups/imports/schedule.rs.
const ACTIVE_STATES = new Set(['queued', 'claimed', 'preparing', 'ready', 'running', 'cancelling', 'awaiting_key'])
const OWN_FOLDERS = ['_aruna_parts', '_aruna_backend_probe']

/** An S3 storage without a fixed bucket: each rule names its own bucket. */
export function splitsBuckets(backend: GroupBackendResponse): boolean {
  return backend.kind === 's3' && !backend.public_config.bucket
}

/** The bucket and the folder of a path on a storage. */
export function splitPath(backend: GroupBackendResponse, path: string): { bucket: string; folder: string } {
  if (!splitsBuckets(backend)) return { bucket: storeName(backend), folder: path }
  const slash = path.indexOf('/')
  return slash < 0 ? { bucket: path, folder: '' } : { bucket: path.slice(0, slash), folder: path.slice(slash + 1) }
}

/** A storage place as "bucket / folder/". */
export function storagePlace(backend: GroupBackendResponse | undefined, path: string): string {
  if (!backend) return path
  const { bucket, folder } = splitPath(backend, path)
  return `${bucket} / ${folder}`
}

/** An Aruna place as "bucket / folder/", or "bucket (whole bucket)". */
export function arunaPlace(link: Pick<BackendImport, 'bucket' | 'key_prefix'>): string {
  return link.key_prefix ? `${link.bucket} / ${link.key_prefix}` : `${link.bucket} (whole bucket)`
}

/** Where the default rule of a storage writes: its default bucket, or its fixed bucket. */
export function defaultBucket(backend: GroupBackendResponse): string | null {
  return backend.public_config.default_bucket ?? (splitsBuckets(backend) ? null : storeName(backend))
}

/** "Your S3 storage · endpoint", or the kind and its container for other kinds. */
export function storageLine(backend: GroupBackendResponse): string {
  const kind = backendSchema(backend.kind)?.label ?? backend.kind
  const where = backend.public_config.endpoint ?? storeName(backend)
  return `Your ${kind} storage · ${where}`
}

/** Hover text of the bucket check from the state saved with the rule; null when unknown. */
export function bucketTitle(backend: GroupBackendResponse, bucket: string): string | null {
  const state = backend.public_config[`bucket:${bucket}`]
  if (state === 'created') return 'Bucket created'
  if (state === 'found') return 'Bucket found'
  // A fixed bucket was checked when the storage was added.
  return splitsBuckets(backend) ? null : 'Bucket found'
}

export interface RunText {
  text: string
  tone: 'muted' | 'failed' | 'active'
  failures: boolean
}

/** The last run in a few words: "Synced 2h ago", "Running… 312 added, 400 checked", "3 failed · 1d ago". */
export function runText(run: BackendImportRun | null | undefined): RunText {
  if (!run) return { text: 'Never run', tone: 'muted', failures: false }
  const ago = relativeTime(run.started_at)
  const failures = run.failed > 0
  if (run.state === 'cancelling') return { text: 'Stopping…', tone: 'active', failures }
  if (run.state === 'awaiting_key') return { text: 'Waiting for an unlock', tone: 'active', failures }
  if (ACTIVE_STATES.has(run.state)) {
    const checked = run.imported + run.skipped + run.failed
    const text = `Running… ${formatNumber(run.imported)} added, ${formatNumber(checked)} checked`
    return { text, tone: 'active', failures }
  }
  if (run.state === 'cancelled') return { text: `Stopped · ${ago}`, tone: 'muted', failures }
  if (run.state !== 'succeeded' && run.state !== 'failed') return { text: `Unknown · ${ago}`, tone: 'muted', failures }
  if (failures) return { text: `${formatNumber(run.failed)} failed · ${ago}`, tone: 'failed', failures }
  if (run.state === 'failed') return { text: `Failed · ${ago}`, tone: 'failed', failures }
  return { text: `Synced ${ago}`, tone: 'muted', failures }
}

export function runActive(run: BackendImportRun | null | undefined): boolean {
  return Boolean(run && ACTIVE_STATES.has(run.state))
}

/**
 * The error of a run that stopped as a whole, for the red cross; null otherwise. Nodes
 * without the run error count a failed run that processed nothing but kept an item error.
 */
export function bucketError(run: BackendImportRun | null | undefined): string | null {
  if (!run || ACTIVE_STATES.has(run.state) || run.state === 'succeeded') return null
  if (run.error) return run.error
  if (run.state !== 'failed' || run.imported > 0 || run.skipped > 0) return null
  return run.errors[0]?.error ?? null
}

/** Buckets that hold or held the default rule; Aruna's own files may be there. */
export function layoutBuckets(backend: GroupBackendResponse): string[] {
  const former = Object.keys(backend.public_config)
    .filter((key) => key.startsWith('layout:'))
    .map((key) => key.slice('layout:'.length))
  const current = backend.public_config.default_bucket
  return current ? [current, ...former] : former
}

/** S3 bucket naming, in plain words; null when the name is fine. */
export function bucketProblem(name: string): string | null {
  if (!name) return 'Enter a bucket name.'
  if (name.length < 3 || name.length > 63) return 'A bucket name has 3 to 63 characters.'
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name) || name.includes('..')) {
    return 'Use lowercase letters, digits, dots and hyphens; start and end with a letter or digit.'
  }
  return null
}

/** A default bucket name for a group, like "aruna-lab-default". */
export function suggestBucket(groupName: string): string {
  const slug = groupName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug ? `aruna-${slug}-default` : 'aruna-default'
}

function overlaps(left: string, right: string): boolean {
  return left.startsWith(right) || right.startsWith(left)
}

/** The places a link uses on its storage, as storage paths. */
function linkPaths(link: BackendImport): { backendId: string; path: string }[] {
  return [
    { backendId: link.backend_id, path: link.backend_prefix },
    { backendId: link.write_backend_id || link.backend_id, path: link.write_prefix ?? link.backend_prefix },
  ]
}

/** Why a linked bucket and folder cannot be saved; null when it can. With `shared`, the new link
 * writes inside the folder it reads, so it may share that folder with links that do the same. */
export function linkConflict(
  backend: GroupBackendResponse,
  links: BackendImport[],
  path: string,
  importId?: string | null,
  shared = false,
): string | null {
  const { bucket, folder } = splitPath(backend, path)
  if (splitsBuckets(backend)) {
    const problem = bucketProblem(bucket)
    if (problem) return problem
    if (layoutBuckets(backend).includes(bucket)) {
      return `Bucket ${bucket} holds Aruna's files of a default rule. Pick another bucket.`
    }
  }
  if (OWN_FOLDERS.some((own) => folder === `${own}/` || folder.startsWith(`${own}/`))) {
    return 'The folder lies inside a folder Aruna uses for its own files.'
  }
  // The storage root goes in front of every key, with a separator.
  const root = (backend.public_config.root ?? '').replace(/^\/+|\/+$/g, '')
  const rootBytes = root ? new TextEncoder().encode(root).length + 1 : 0
  if (rootBytes + new TextEncoder().encode(folder).length + NAME_ROOM > MAX_KEY_BYTES) {
    return 'The folder is too long: paths there are at most 1024 bytes.'
  }
  for (const link of links) {
    if (link.import_id === importId || (shared && writesInside(link))) continue
    const clash = linkPaths(link).some(
      (used) => used.backendId === backend.backend_id && overlaps(used.path, path),
    )
    if (clash) {
      return `This folder overlaps the link of ${arunaPlace(link)}. Pick another folder or bucket.`
    }
  }
  return null
}

/** Why an Aruna bucket folder cannot take another link: another link shares its folders. */
export function arunaConflict(links: BackendImport[], bucket: string, folder: string): string | null {
  const linked = links.find((link) => link.bucket === bucket && overlaps(link.key_prefix, folder))
  return linked ? `This Aruna folder overlaps the link of ${arunaPlace(linked)}. Pick another folder.` : null
}

/** Why a bucket cannot take the default rule of a storage; null when it can. */
export function defaultConflict(
  backend: GroupBackendResponse,
  links: BackendImport[],
  bucket: string,
): string | null {
  const problem = bucketProblem(bucket)
  if (problem) return problem
  const linked = links.find((link) =>
    linkPaths(link).some((used) => used.backendId === backend.backend_id && used.path.split('/')[0] === bucket),
  )
  return linked ? `Bucket ${bucket} is linked to ${arunaPlace(linked)}. Pick another bucket.` : null
}

/** The files of a bucket found not where the rules put them, and any move now running. */
export interface MoveView {
  misplaced: number
  /** A count stopped early, so more files may need a move. */
  partial: boolean
  running: boolean
  done: number
}

/** Whether Move files makes sense: files to move, maybe more, or a move that runs. */
export function moveOffer(view: MoveView): boolean {
  return view.misplaced > 0 || view.partial || view.running
}

export const MOVE_BUSY = 'Another move is still running in this bucket.'

/** A short message for a refused move, or null for any other error. */
export function moveRefusal(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null
  if (err.code === 'move_running') return MOVE_BUSY
  return err.code === 'bucket_encrypted' ? 'This bucket is encrypted, so its files cannot be moved.' : null
}

/** A move answer that remembers the folder it was asked for, as counts differ per folder. */
export type AskedMove = BucketMoveResponse & { asked?: string }

/** One key per move run and asked folder, so a new run starts a new total. */
function runKey(move: AskedMove): string {
  return `${move.bucket}\n${move.asked ?? ''}\n${move.move_prefix ?? ''}\n${move.progress?.started_at_ms}`
}

/** Files of a move run seen so far: the largest of left to move plus moved. */
export type MoveTotals = Map<string, number>

/** Keeps the largest total of each running move, so the total never shrinks. */
export function rememberMoves(totals: MoveTotals, moves: AskedMove[]) {
  for (const move of moves) {
    const progress = move.progress
    if (!progress) continue
    const scope = `${move.bucket}\n${move.asked ?? ''}\n`
    const key = runKey(move)
    // A finished or superseded run of the same scope is forgotten.
    for (const old of [...totals.keys()]) {
      if (old.startsWith(scope) && (old !== key || progress.finished_at_ms != null)) totals.delete(old)
    }
    if (progress.finished_at_ms != null) continue
    totals.set(key, Math.max(totals.get(key) ?? 0, move.misplaced + progress.migrated))
  }
}

/**
 * `prefix` limits progress to moves started for that prefix; counts stay whole.
 * Done counts down the live left-to-move count, as the node saves progress only per page.
 */
export function moveView(moves: AskedMove[], prefix?: string, totals?: MoveTotals): MoveView {
  const view: MoveView = { misplaced: 0, partial: false, running: false, done: 0 }
  for (const move of moves) {
    const progress = move.progress
    view.misplaced += move.misplaced
    if (!move.complete) view.partial = true
    if (!progress || progress.finished_at_ms != null) continue
    if (prefix !== undefined && (move.move_prefix ?? '') !== prefix) continue
    view.running = true
    const total = Math.max(totals?.get(runKey(move)) ?? 0, move.misplaced + progress.migrated)
    view.done += Math.max(0, total - move.misplaced)
  }
  return view
}

/** "Moving files: 1,240 of 3,500". */
export function moveText(view: MoveView): string {
  return `Moving files: ${formatNumber(view.done)} of ${formatNumber(view.done + view.misplaced)}${view.partial ? '+' : ''}`
}
