// Reads one pinned version of a locked bucket with the caller's scoped key: the envelope opens in
// the key worker and only that version's object key goes to the node, in a request header.
import {
  ApiError,
  downloadWithKey,
  getObjectEnvelope,
  listKeyGrants,
  listUserKeys,
  requestScopedKey,
  type AbeRecord,
  type ApiClientOptions,
  type KeyGrantFields,
  type KeyScope,
  type ObjectEnvelopeView,
} from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import type { X25519Pair } from './hpke'
import { KeyWorkerClosedError, importGrant, openObject, type KeyHandle } from './keyWorker'

export interface KeyedTarget {
  bucket: string
  key: string
  versionId: string
  client: ApiClientOptions
}

/** Why a read waits: no key yet, or a copy whose envelope a key holder still prepares. */
export type ReadWait = 'pending' | 'preparing'

export class ReadWaitError extends Error {
  constructor(readonly wait: ReadWait) {
    super(wait === 'pending' ? 'Waiting for an encryption key.' : 'This copy is still being prepared.')
    this.name = 'ReadWaitError'
  }
}

/** The message of a recognized read failure; null for an unknown one or a bucket lock. */
export function readFailure(cause: unknown): string | null {
  if (!(cause instanceof ApiError)) return cause instanceof TypeError ? errorMessage(cause) : null
  if (cause.code === 'object_key_required') return null
  return cause.status === 403 ? 'You do not have permission to read this file.' : errorMessage(cause)
}

/** The vault operations a read needs. */
export interface ReadVault {
  openUserKey(keyId: string): Promise<X25519Pair | null>
}

const handles = new Map<string, KeyHandle>()

/** The envelope of the pinned version; a copy without one waits for a key holder. */
export async function fetchEnvelope(target: KeyedTarget): Promise<ObjectEnvelopeView> {
  try {
    return await getObjectEnvelope(target.bucket, target.key, target.versionId, target.client)
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'envelope_pending') throw new ReadWaitError('preparing')
    throw cause
  }
}

function covers(scope: KeyScope, key: string): boolean {
  return scope.kind === 'exact' ? scope.value === key : key.startsWith(scope.value)
}

/** A caller's grant that opens `envelope`: same generation, parameters and epoch; scope covers the key. */
export function usableGrant(
  grants: AbeRecord<KeyGrantFields>[],
  envelope: ObjectEnvelopeView,
  key: string,
): AbeRecord<KeyGrantFields> | null {
  const admitted = envelope.parameters
  return grants.find(({ fields: { request } }) =>
    request.parameters.generation === admitted.generation &&
    request.parameters.fingerprint === admitted.fingerprint &&
    request.epochs.includes(envelope.context.epoch) &&
    covers(request.scope, key)) ?? null
}

export async function ownGrants(target: KeyedTarget): Promise<AbeRecord<KeyGrantFields>[]> {
  const grants: AbeRecord<KeyGrantFields>[] = []
  let cursor: string | null = null
  do {
    const page = await listKeyGrants(target.bucket, cursor, target.client)
    grants.push(...page.records)
    cursor = page.next_cursor
  } while (cursor)
  return grants
}

/** The whole bucket first, then the file's folder, then the file: one request covers many files. */
export function requestScopes(key: string): KeyScope[] {
  const folder = key.slice(0, key.lastIndexOf('/') + 1)
  const scopes: KeyScope[] = [{ kind: 'subtree', value: '' }]
  if (folder) scopes.push({ kind: 'subtree', value: folder })
  scopes.push({ kind: 'exact', value: key })
  return scopes
}

/** Creates or repeats the caller's request; a grant from an unlocked bucket comes back at once. */
export async function requestKey(target: KeyedTarget): Promise<AbeRecord<KeyGrantFields> | null> {
  const scopes = requestScopes(target.key)
  for (const [index, scope] of scopes.entries()) {
    try {
      const result = await requestScopedKey(target.bucket, scope, target.client)
      return result.kind === 'grant' ? result.grant : null
    } catch (cause) {
      // A scope wider than the caller's access is refused; a narrower one may still be admitted.
      if (!(cause instanceof ApiError && cause.status === 403) || index === scopes.length - 1) throw cause
    }
  }
  return null
}

async function grantPair(grant: AbeRecord<KeyGrantFields>, userId: string, vault: ReadVault, client: ApiClientOptions) {
  const record = grant.fields.request.recipient_record
  const entry = (await listUserKeys(userId, client)).keys.find((key) => key.record_id === record)
  const pair = entry ? await vault.openUserKey(entry.key_id) : null
  if (!pair) throw new Error('The key for this file is sealed to a key your vault does not hold.')
  return pair
}

/**
 * Opens the object key with `grant` and reads the pinned version; the key is cleared afterwards.
 * `guard` throws once the read, session or vault ended; `signal` aborts the download.
 */
export async function readWithGrant(
  target: KeyedTarget,
  envelope: ObjectEnvelopeView,
  grant: AbeRecord<KeyGrantFields>,
  userId: string,
  vault: ReadVault,
  guard: () => void = () => {},
  signal?: AbortSignal,
): Promise<Blob> {
  const id = `${target.client.baseUrl ?? ''}\u0000${grant.fields.request.request_id}`
  const { context } = envelope
  const pinned = {
    versionId: target.versionId,
    objectKey: target.key,
    epoch: context.epoch,
    writeId: context.write_id,
    publicKey: context.public_key,
  }
  let objectKey: Uint8Array
  for (let attempt = 0; ; attempt += 1) {
    let handle = handles.get(id)
    if (!handle) {
      const pair = await grantPair(grant, userId, vault, target.client)
      guard()
      handle = await importGrant(grant, pair, grant.fields.request)
      handles.set(id, handle)
    }
    guard()
    try {
      objectKey = await openObject(handle, envelope, pinned)
      break
    } catch (cause) {
      // The vault locked since the import: the handle ended with the worker.
      handles.delete(id)
      if (!(cause instanceof KeyWorkerClosedError) || attempt > 0) throw cause
    }
  }
  try {
    guard()
    const request = { bucket: target.bucket, key: target.key, versionId: target.versionId, objectKey, signal }
    return await downloadWithKey(request, target.client)
  } finally {
    objectKey.fill(0)
  }
}
