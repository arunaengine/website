// Run inputs and results as rows: the files of one database collapse into one row, as do the
// many files of one bucket; a single file stays its own row.
import { parseDataIdentity } from '@/lib/crate/dataIdentity'
import type { RunCrateFileRef, RunCratePart } from '@/lib/runCrate'

/** Fewer files than this in one bucket stay listed one by one. */
export const FOLDER_GROUP_MIN = 6

export interface FileGroup {
  key: string
  files: RunCrateFileRef[]
  database?: RunCratePart
  release?: RunCratePart
  bucket?: string
  nodeId?: string
  /** The folder all files share, with a trailing slash; empty for the bucket root. */
  folder: string
  /** The summed size; `complete` is false when a file has no size. */
  bytes: { total: number; complete: boolean }
}

function sharedFolder(keys: string[]): string {
  const folders = keys.map((key) => key.split('/').slice(0, -1))
  const shared: string[] = []
  for (const [index, part] of (folders[0] ?? []).entries()) {
    if (!folders.every((parts) => parts[index] === part)) break
    shared.push(part)
  }
  return shared.length ? `${shared.join('/')}/` : ''
}

function groupOf(key: string, files: RunCrateFileRef[], endpoint?: string | null): FileGroup {
  const identities = files.map((file) => parseDataIdentity(file, endpoint))
  const sizes = files.map((file) => (file.contentSize?.trim() ? Number(file.contentSize) : NaN))
  return {
    key,
    files,
    database: files[0]?.partOf?.find((part) => part.kind === 'database'),
    release: files[0]?.partOf?.find((part) => part.kind === 'release'),
    bucket: identities[0]?.s3?.bucket,
    nodeId: identities[0]?.arn?.nodeId,
    folder: sharedFolder(identities.map((identity) => identity.s3?.key ?? '')),
    bytes: {
      total: sizes.filter(Number.isFinite).reduce((sum, size) => sum + size, 0),
      complete: sizes.every(Number.isFinite),
    },
  }
}

export function groupFiles(files: RunCrateFileRef[], endpoint?: string | null): FileGroup[] {
  const byKey = new Map<string, RunCrateFileRef[]>()
  for (const file of files) {
    const part = file.partOf?.find((entry) => entry.kind === 'database') ?? file.partOf?.find((entry) => entry.kind === 'release')
    const identity = parseDataIdentity(file, endpoint)
    const bucket = identity.s3 ? `bucket:${identity.arn?.nodeId ?? ''}/${identity.s3.bucket}` : null
    const key = part?.id ?? bucket ?? `file:${file.id}`
    byKey.set(key, [...(byKey.get(key) ?? []), file])
  }
  return [...byKey].flatMap(([key, members]) => {
    if (!key.startsWith('bucket:') || members.length >= FOLDER_GROUP_MIN) return [groupOf(key, members, endpoint)]
    return members.map((file) => groupOf(`file:${file.id}`, [file], endpoint))
  })
}
