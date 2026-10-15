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
    options?: { markers?: boolean },
  ): Promise<{ objects: { key: string }[]; truncated: boolean }>
  copyObject(source: { bucket: string; key: string }, bucket: string, key: string, nodeId?: string | null): Promise<void>
  deleteObject(bucket: string, key: string, nodeId?: string | null): Promise<void>
  headObject(bucket: string, key: string, nodeId?: string | null): Promise<{ etag?: string; versionId?: string }>
}

function sameRevision(a: { etag?: string; versionId?: string }, b: { etag?: string; versionId?: string }): boolean {
  return a.etag === b.etag && a.versionId === b.versionId
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
  check: () => void = () => undefined,
): Promise<{ from: string; to: string; source: string }[]> {
  const copies: { from: string; to: string; source: string }[] = []
  for (const source of sources) {
    const nextName = name?.trim() || baseName(source.key)
    if (!source.folder) {
      copies.push({ from: source.key, to: `${target.prefix}${nextName}`, source: source.key })
      continue
    }
    // Folder markers come along, so empty folders inside are moved too.
    const listing = await store.listObjectsRecursive(bucket, source.key, FOLDER_LIMIT, nodeId, { markers: true })
    check()
    if (listing.truncated) {
      throw new Error(`${baseName(source.key)}/ holds more than ${FOLDER_LIMIT} files. Pick a smaller folder.`)
    }
    if (!listing.objects.length) throw new Error(`${baseName(source.key)}/ holds no files.`)
    for (const object of listing.objects) {
      const to = `${target.prefix}${nextName}/${object.key.slice(source.key.length)}`
      copies.push({ from: object.key, to, source: source.key })
    }
  }
  return copies
}

/**
 * Copies everything first; a move or rename then deletes exactly the copied revisions,
 * so a file that arrives or changes meanwhile stays. `onMoved` names each source fully moved.
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
  // Throws once the session the transfer started in is gone; it runs after every await.
  check: () => void = () => undefined,
): Promise<void> {
  const step = async <T>(work: Promise<T>): Promise<T> => {
    const result = await work
    check()
    return result
  }
  check()
  const copies = await step(plannedCopies(store, bucket, sources, target, nodeId, name, check))
  const copied = new Map<string, { etag?: string; versionId?: string }>()
  for (const copy of copies) {
    // A move remembers the revision it copies; a newer one is never deleted.
    if (mode !== 'copy') copied.set(copy.from, await step(store.headObject(bucket, copy.from, nodeId)))
    await step(store.copyObject({ bucket, key: copy.from }, target.bucket, copy.to, nodeId))
  }
  if (mode === 'copy') return
  const changed: string[] = []
  for (const source of sources) {
    let kept = false
    for (const copy of copies) {
      if (copy.source !== source.key) continue
      check()
      const now = await step(store.headObject(bucket, copy.from, nodeId))
      if (!sameRevision(now, copied.get(copy.from) ?? {})) {
        changed.push(baseName(copy.from))
        kept = true
        continue
      }
      // Soft delete without a version. The node has no If-Match on delete, so a write
      // between this check and the delete can still be hidden behind the marker.
      await store.deleteObject(bucket, copy.from, nodeId)
    }
    // A source whose deletes all went through is recorded before the session check.
    if (!kept) onMoved(source.key)
    check()
  }
  if (changed.length) throw new Error(`Changed during the move, kept: ${changed.join(', ')}.`)
}
