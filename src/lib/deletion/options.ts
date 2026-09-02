// The single source for what a delete can do to one target. Every destructive
// control in the Data views asks this function, so an outcome the backend
// cannot deliver is never offered and a disabled one always carries its reason.
import { formatBytes } from '@/lib/utils'

export type DeletionKind =
  | 'object'
  | 'deleted-object'
  | 'version'
  | 'marker'
  | 'folder'
  | 'selection'
  | 'bucket'

/** What the key's head pointer is: a stored version, or a delete marker. */
export type DeletionHeadState = 'live' | 'marker' | 'unknown'

export interface DeletionCounts {
  currentHeads: number
  noncurrentVersions: number
  deleteMarkers: number
  openMultipartUploads: number
  /** False means the node answered with one bounded page, not a total. */
  complete: boolean
}

export interface DeletionPermissions {
  canWrite: boolean
  /** From the deletion preflight; null until it has answered. */
  canPurge: boolean | null
}

export interface DeletionTarget {
  kind: DeletionKind
  headState?: DeletionHeadState
  /** Version and marker rows: whether this row is the current head. */
  isCurrent?: boolean
  /** Bytes this version still uses, for the quota sentence. */
  bytes?: number
  counts?: DeletionCounts | null
  permissions: DeletionPermissions
  /** The bucket is served by another node, which this browser cannot drive. */
  remote: boolean
  selectionCount?: number
}

export type DeletionOptionId =
  | 'delete'
  | 'restore'
  | 'delete-version'
  | 'make-current'
  | 'delete-permanently'
  | 'delete-bucket'

export type DeletionTier = 'one-click' | 'confirm' | 'typed-name'

/** The exact call the option makes. */
export type DeletionCall =
  | { operation: 'write-marker' }
  | { operation: 'write-markers' }
  | { operation: 'delete-version' }
  | { operation: 'copy-version' }
  | { operation: 'purge' }
  | { operation: 'delete-bucket' }

export interface DeletionOption {
  id: DeletionOptionId
  label: string
  description: string
  tier: DeletionTier
  call: DeletionCall
  /** Nothing on this node brings the data back. */
  irreversible: boolean
  disabledReason: string | null
}

const REMOTE_REASON =
  'Deleting permanently runs on the node that holds this bucket. Open the bucket on that node to delete it there.'
const PURGE_PENDING_REASON = 'Checking whether you may delete this permanently…'
const PURGE_DENIED_REASON =
  'This session may inspect this scope but it may not delete it permanently.'

function writeReason(kind: DeletionKind): string {
  if (kind === 'folder') return 'This session cannot delete this entire folder.'
  if (kind === 'selection') return 'This session cannot delete every selected object.'
  if (kind === 'bucket') return 'This session cannot delete this bucket.'
  return 'This session cannot delete this object.'
}

function writeBlocked(target: DeletionTarget): string | null {
  return target.permissions.canWrite ? null : writeReason(target.kind)
}

function purgeBlocked(target: DeletionTarget): string | null {
  if (target.remote) return REMOTE_REASON
  if (!target.permissions.canWrite) return writeReason(target.kind)
  if (target.permissions.canPurge === null) return PURGE_PENDING_REASON
  if (!target.permissions.canPurge) return PURGE_DENIED_REASON
  return null
}

function deleteOption(target: DeletionTarget): DeletionOption {
  const many = target.kind === 'folder' || target.kind === 'selection'
  return {
    id: 'delete',
    label: 'Delete',
    description: many
      ? 'Writes a delete marker for every current object in this scope. Earlier versions stay, and Show deleted brings each object back.'
      : 'Writes a delete marker. The object leaves the listing, every earlier version stays, and Show deleted brings it back.',
    tier: many ? 'confirm' : 'one-click',
    call: { operation: many ? 'write-markers' : 'write-marker' },
    irreversible: false,
    disabledReason: writeBlocked(target),
  }
}

function restoreOption(target: DeletionTarget): DeletionOption {
  return {
    id: 'restore',
    label: 'Restore',
    description:
      'Deletes the delete marker, so the newest earlier version becomes the current one again.',
    tier: 'one-click',
    call: { operation: 'delete-version' },
    irreversible: false,
    disabledReason: writeBlocked(target),
  }
}

// On a whole file the version is not known yet, so this outcome asks for one;
// on a version or marker row it names the row it came from.
function versionOption(target: DeletionTarget): DeletionOption {
  const picks = target.kind === 'object'
  const bytes = target.bytes === undefined ? '' : ` It frees ${formatBytes(target.bytes)}.`
  return {
    id: 'delete-version',
    label: picks ? 'Delete one version permanently' : 'Delete this version',
    description: picks
      ? 'Deletes exactly one stored version or delete marker of this file on this node. Choose it below. Nothing brings it back.'
      : `Deletes this one version on this node.${bytes} Nothing brings it back.`,
    tier: 'confirm',
    call: { operation: 'delete-version' },
    irreversible: true,
    disabledReason: writeBlocked(target),
  }
}

function currentOption(target: DeletionTarget): DeletionOption {
  const bytes = target.bytes === undefined ? 'its bytes' : formatBytes(target.bytes)
  return {
    id: 'make-current',
    label: 'Make current',
    description: `Copies this version onto the key, which creates a new version; the old one keeps using ${bytes} until it is deleted permanently.`,
    tier: 'confirm',
    call: { operation: 'copy-version' },
    irreversible: false,
    disabledReason: writeBlocked(target),
  }
}

function permanentOption(target: DeletionTarget): DeletionOption {
  const scope =
    target.kind === 'bucket'
      ? 'this bucket'
      : target.kind === 'folder'
        ? 'this folder'
        : target.kind === 'selection'
          ? 'every selected object'
          : 'this object'
  return {
    id: 'delete-permanently',
    label: 'Delete permanently',
    description: `Deletes every version and delete marker of ${scope} on this node, and aborts its open uploads. Nothing brings them back.`,
    tier: target.kind === 'folder' || target.kind === 'bucket' ? 'typed-name' : 'confirm',
    call: { operation: 'purge' },
    irreversible: true,
    disabledReason: purgeBlocked(target),
  }
}

function bucketOption(target: DeletionTarget): DeletionOption {
  return {
    id: 'delete-bucket',
    label: 'Delete bucket',
    description:
      'Deletes the empty bucket on this node and removes the sync relationships that point at it.',
    tier: 'typed-name',
    call: { operation: 'delete-bucket' },
    irreversible: true,
    disabledReason: purgeBlocked(target),
  }
}

/** A bucket S3 can drop directly: no head, no version, no marker, no upload. */
export function bucketIsEmpty(counts: DeletionCounts | null | undefined): boolean {
  if (!counts || !counts.complete) return false
  return (
    counts.currentHeads === 0 &&
    counts.noncurrentVersions === 0 &&
    counts.deleteMarkers === 0 &&
    counts.openMultipartUploads === 0
  )
}

/**
 * The outcomes that apply to one target, most recoverable first. A live object
 * never offers Restore and a marker-headed one never offers Delete, whatever
 * the caller passes as the kind.
 */
export function deletionOptions(target: DeletionTarget): DeletionOption[] {
  const kind = resolvedKind(target)
  const resolved: DeletionTarget = { ...target, kind }
  switch (kind) {
    case 'object':
      return [deleteOption(resolved), versionOption(resolved), permanentOption(resolved)]
    case 'deleted-object':
      return [restoreOption(resolved), permanentOption(resolved)]
    case 'version':
      return resolved.isCurrent
        ? [versionOption(resolved)]
        : [currentOption(resolved), versionOption(resolved)]
    case 'marker':
      return resolved.isCurrent ? [restoreOption(resolved)] : [versionOption(resolved)]
    case 'folder':
    case 'selection':
      return [deleteOption(resolved), permanentOption(resolved)]
    case 'bucket':
      return [bucketIsEmpty(resolved.counts) ? bucketOption(resolved) : permanentOption(resolved)]
  }
}

// The head state decides between a live object and a deleted one, so a stale
// caller cannot offer a second delete marker or a restore that has nothing to
// restore.
function resolvedKind(target: DeletionTarget): DeletionKind {
  if (target.kind === 'object' && target.headState === 'marker') return 'deleted-object'
  if (target.kind === 'deleted-object' && target.headState === 'live') return 'object'
  return target.kind
}
