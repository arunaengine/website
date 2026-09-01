// What one destructive control hands to the delete dialog. Everything the
// dialog needs to name, price and perform the deletion is in here; the
// applicable outcomes come from deletionOptions.
import type { StorageDeletionScope } from '@/lib/storageDeletion'
import type {
  DeletionHeadState,
  DeletionKind,
  DeletionOption,
  DeletionOptionId,
} from './options'

export interface DeleteRequest {
  kind: DeletionKind
  bucket: string
  /** Node holding the bucket; null is the connected node. */
  nodeId: string | null
  /** Object key, folder prefix with its trailing slash, or the version's key. */
  key?: string
  versionId?: string
  /** Version and marker rows: whether this row is the current head. */
  isCurrent?: boolean
  headState?: DeletionHeadState
  /** Selection only: the exact selected keys. */
  keys?: string[]
  /** Bytes the target uses today, when the listing knows them. */
  bytes?: number
  /** Which applicable outcome the control that opened the dialog meant. */
  option?: DeletionOptionId
}

/** What a finished deletion reports back to the surface that asked for it. */
export interface DeletionResult {
  request: DeleteRequest
  option: DeletionOption
  /** Keys (or the bucket name) the node confirmed as done. */
  committed: string[]
}

/** The REST preflight and purge scope, or null for a kind that has none. */
export function requestScope(request: DeleteRequest): StorageDeletionScope | null {
  if (request.kind === 'bucket') return { kind: 'bucket', bucket: request.bucket }
  if (request.kind === 'folder' && request.key) {
    return { kind: 'prefix', bucket: request.bucket, prefix: request.key }
  }
  if ((request.kind === 'object' || request.kind === 'deleted-object') && request.key) {
    return { kind: 'file', bucket: request.bucket, key: request.key }
  }
  return null
}

const NOUNS: Record<DeletionKind, string> = {
  object: 'object',
  'deleted-object': 'deleted object',
  version: 'version',
  marker: 'delete marker',
  folder: 'folder',
  selection: 'selected objects',
  bucket: 'bucket',
}

export function requestNoun(request: DeleteRequest): string {
  if (request.kind === 'selection') {
    const count = request.keys?.length ?? 0
    return `${count} selected object${count === 1 ? '' : 's'}`
  }
  return NOUNS[request.kind]
}

/** What the dialog prints as the target's name. */
export function requestLabel(request: DeleteRequest): string {
  if (request.kind === 'bucket') return request.bucket
  if (request.kind === 'selection') return requestNoun(request)
  return request.key ?? request.bucket
}

/** The exact text the typed-name tier asks a person to type. */
export function requestName(request: DeleteRequest): string {
  if (request.kind === 'bucket') return request.bucket
  return (request.key ?? '').replace(/\/$/, '')
}
