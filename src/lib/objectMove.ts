// Move, copy and rename in the object browser. S3 has no move: every file is
// copied first, and only a move or rename then deletes the old keys.

export type TransferMode = 'move' | 'copy' | 'rename'

/** A ticked file, or a folder whose key ends with a slash. */
export interface TransferSource {
  key: string
  folder: boolean
}

export interface TransferTarget {
  bucket: string
  prefix: string
}

export interface TransferStore {
  listObjectsRecursive(
    bucket: string,
    prefix: string,
    max: number,
    nodeId?: string | null,
  ): Promise<{ objects: { key: string }[]; truncated: boolean }>
  copyObject(source: { bucket: string; key: string }, bucket: string, key: string, nodeId?: string | null): Promise<void>
  deleteObject(bucket: string, key: string, nodeId?: string | null): Promise<void>
  deletePrefix(
    bucket: string,
    prefix: string,
    nodeId?: string | null,
  ): Promise<{ errors: { key: string; message: string }[] }>
}

export const FOLDER_LIMIT = 1000

export function baseName(key: string): string {
  return key.replace(/\/$/, '').split('/').pop() ?? key
}

export function parentPrefix(key: string): string {
  const path = key.replace(/\/$/, '')
  return path.slice(0, path.lastIndexOf('/') + 1)
}

/** "bucket/folder" as typed in the dialog, as a bucket and a folder prefix. */
export function parseTarget(text: string): TransferTarget | null {
  const trimmed = text.trim().replace(/^\/+/, '')
  const slash = trimmed.indexOf('/')
  const bucket = slash < 0 ? trimmed : trimmed.slice(0, slash)
  if (!bucket) return null
  const rest = slash < 0 ? '' : trimmed.slice(slash + 1).replace(/^\/+|\/+$/g, '')
  return { bucket, prefix: rest ? `${rest}/` : '' }
}

/** Why the files cannot go to the target, or null. */
export function targetProblem(
  mode: TransferMode,
  bucket: string,
  sources: TransferSource[],
  target: TransferTarget,
  name?: string,
): string | null {
  if (mode === 'rename') {
    const next = name?.trim() ?? ''
    if (!next) return 'Type a name.'
    if (next.includes('/')) return 'A name cannot contain /.'
    if (sources.length === 1 && next === baseName(sources[0].key)) return 'This is the current name.'
    return null
  }
  for (const source of sources) {
    if (target.bucket !== bucket) continue
    if (source.folder && target.prefix.startsWith(source.key)) return 'A folder cannot go into itself.'
    if (mode === 'move' && parentPrefix(source.key) === target.prefix) return 'This is already their folder.'
  }
  return null
}

/** Every copy the transfer makes: each file, and each file below a folder. */
export async function plannedCopies(
  store: TransferStore,
  bucket: string,
  sources: TransferSource[],
  target: TransferTarget,
  nodeId: string | null,
  name?: string,
): Promise<{ from: string; to: string }[]> {
  const copies: { from: string; to: string }[] = []
  for (const source of sources) {
    const nextName = name?.trim() || baseName(source.key)
    if (!source.folder) {
      copies.push({ from: source.key, to: `${target.prefix}${nextName}` })
      continue
    }
    const listing = await store.listObjectsRecursive(bucket, source.key, FOLDER_LIMIT, nodeId)
    if (listing.truncated) {
      throw new Error(`${baseName(source.key)}/ holds more than ${FOLDER_LIMIT} files. Pick a smaller folder.`)
    }
    if (!listing.objects.length) throw new Error(`${baseName(source.key)}/ holds no files.`)
    for (const object of listing.objects) {
      copies.push({ from: object.key, to: `${target.prefix}${nextName}/${object.key.slice(source.key.length)}` })
    }
  }
  return copies
}

/**
 * Copies everything first; a move or rename deletes the sources only after that.
 * `onMoved` names each source that is fully gone from its old place.
 */
export async function runTransfer(
  store: TransferStore,
  mode: TransferMode,
  bucket: string,
  sources: TransferSource[],
  target: TransferTarget,
  nodeId: string | null,
  name?: string,
  onMoved: (key: string) => void = () => undefined,
): Promise<void> {
  const copies = await plannedCopies(store, bucket, sources, target, nodeId, name)
  for (const copy of copies) {
    await store.copyObject({ bucket, key: copy.from }, target.bucket, copy.to, nodeId)
  }
  if (mode === 'copy') return
  for (const source of sources) {
    if (!source.folder) {
      await store.deleteObject(bucket, source.key, nodeId)
      onMoved(source.key)
      continue
    }
    const result = await store.deletePrefix(bucket, source.key, nodeId)
    if (result.errors.length) {
      throw new Error(`Copied, but ${result.errors.length} old files of ${baseName(source.key)}/ were not deleted.`)
    }
    onMoved(source.key)
  }
}
