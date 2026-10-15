// Wording and checks for the rules of a group's storage: the default rule and linked buckets.
import type { BackendImport, BackendImportRun, GroupBackendResponse } from './api'
import { backendSchema } from './storage'
import { storeName } from './linkedFolders'
import { formatNumber, relativeTime } from './utils'

/** Keys on group storages are at most this long; a folder must leave room for a file. */
export const MAX_KEY_BYTES = 1024
const NAME_ROOM = 28
const ACTIVE_STATES = new Set(['queued', 'claimed', 'preparing', 'running'])

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

/** Hover text of the bucket icon. */
export function bucketTitle(backend: GroupBackendResponse, bucket: string): string {
  const state = backend.public_config[`bucket:${bucket}`]
  if (state === 'created') return 'Bucket created'
  if (state === 'found') return 'Bucket found'
  return 'Bucket ready'
}

export interface RunText {
  text: string
  tone: 'muted' | 'failed' | 'active'
  failures: boolean
}

/** The last run in a few words: "Synced 2h ago", "Running… 312 added", "3 failed · 1d ago". */
export function runText(run: BackendImportRun | null | undefined): RunText {
  if (!run) return { text: 'Never run', tone: 'muted', failures: false }
  const ago = relativeTime(run.started_at)
  if (ACTIVE_STATES.has(run.state)) {
    return { text: `Running… ${formatNumber(run.imported)} added`, tone: 'active', failures: false }
  }
  if (run.failed > 0) return { text: `${formatNumber(run.failed)} failed · ${ago}`, tone: 'failed', failures: true }
  if (run.state === 'failed' || run.state === 'error') return { text: `Failed · ${ago}`, tone: 'failed', failures: false }
  return { text: `Synced ${ago}`, tone: 'muted', failures: false }
}

export function runActive(run: BackendImportRun | null | undefined): boolean {
  return Boolean(run && ACTIVE_STATES.has(run.state))
}

/** The reason of a red cross, or null when the bucket is fine. */
export function runProblem(run: BackendImportRun | null | undefined): string | null {
  if (!run || ACTIVE_STATES.has(run.state)) return null
  if (run.state !== 'failed' && run.state !== 'error' && !run.failed) return null
  return run.errors[0]?.error ?? 'The last run failed.'
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

/** Why a linked bucket and folder cannot be saved; null when it can. */
export function linkConflict(
  backend: GroupBackendResponse,
  links: BackendImport[],
  path: string,
  importId?: string | null,
): string | null {
  const { bucket, folder } = splitPath(backend, path)
  if (splitsBuckets(backend)) {
    const problem = bucketProblem(bucket)
    if (problem) return problem
    if (bucket === backend.public_config.default_bucket) {
      return `Bucket ${bucket} holds the default rule. Pick another bucket.`
    }
  }
  if (new TextEncoder().encode(folder).length + NAME_ROOM > MAX_KEY_BYTES) {
    return 'The folder is too long: paths there are at most 1024 bytes.'
  }
  for (const link of links) {
    if (link.import_id === importId) continue
    const clash = linkPaths(link).some(
      (used) => used.backendId === backend.backend_id && overlaps(used.path, path),
    )
    if (clash) {
      return `This folder overlaps the link of ${arunaPlace(link)}. Pick another folder or bucket.`
    }
  }
  return null
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
