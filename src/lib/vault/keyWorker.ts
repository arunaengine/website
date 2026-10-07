// Main-thread side of the key worker. It starts on first use and keeps imported
// keys as handles; closing it ends every key and pending call. Close it when the
// vault locks, the session ends or the user cancels.
import type { AbeParametersView, AbeRecord, GrantSubmission, KeyGrantFields, KeyRequestFields, ObjectEnvelopeView } from '@/lib/api'
import type { ParameterBytes } from './abe'
import type { KeyWorkerReply, KeyWorkerRequest } from './abe.worker'
import { toBase64 } from './crypto'
import { fromBase64Url, type SealedSecret, type X25519Pair } from './hpke'

/** The worker ended before it answered, so its keys are gone. */
export class KeyWorkerClosedError extends Error {
  constructor() {
    super('The encryption keys were closed.')
    this.name = 'KeyWorkerClosedError'
  }
}

/** An imported key, valid until the worker that holds it is closed. */
export interface KeyHandle {
  run: number
  id: number
  /** The admitted parameters the key was imported under. */
  parameters: AbeParametersView
}

/** The pinned version an envelope must belong to, from its version metadata. */
export interface PinnedVersion {
  versionId: string
  objectKey: string
  epoch: number
  writeId: string
  /** Standard base64 of the object public key. */
  publicKey: string
}

type Pending = { resolve: (value: unknown) => void; reject: (cause: Error) => void }
type Request = KeyWorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never

let worker: Worker | null = null
let run = 0
let calls = 0
const pending = new Map<number, Pending>()

function start(): Worker {
  if (worker) return worker
  const started = new Worker(new URL('./abe.worker.ts', import.meta.url), { type: 'module' })
  started.onmessage = ({ data }: MessageEvent<KeyWorkerReply>) => {
    const call = pending.get(data.id)
    pending.delete(data.id)
    if (!call) return
    if ('error' in data) call.reject(new Error(data.error))
    else call.resolve(data.value)
  }
  started.onerror = () => closeKeyWorker()
  run += 1
  worker = started
  return started
}

function call<T>(request: Request): Promise<T> {
  const target = start()
  calls += 1
  const id = calls
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    target.postMessage({ ...request, id })
  })
}

/** Ends the worker, its keys and every pending call; a later call starts a new one. */
export function closeKeyWorker() {
  worker?.terminate()
  worker = null
  for (const waiting of pending.values()) waiting.reject(new KeyWorkerClosedError())
  pending.clear()
}

function parameterBytes(view: AbeParametersView): ParameterBytes {
  return {
    parameters: fromBase64Url(view.parameters),
    context: fromBase64Url(view.context),
    fingerprint: fromBase64Url(view.fingerprint),
  }
}

/** Opens one of the caller's grants for `expected`, the caller's request with admitted parameters. */
export async function importGrant(
  grant: AbeRecord<KeyGrantFields>,
  pair: X25519Pair,
  expected: KeyRequestFields,
): Promise<KeyHandle> {
  if (!grant.aad) throw new Error('The key grant has no associated data.')
  const input = {
    sealed: { enc: fromBase64Url(grant.fields.enc), ciphertext: fromBase64Url(grant.fields.ciphertext) },
    aad: fromBase64Url(grant.aad),
    pair,
    request: expected,
    issuer: grant.fields.issuer,
    parameters: parameterBytes(expected.parameters),
  }
  const id = await call<number>({ op: 'import', input })
  return { run, id, parameters: expected.parameters }
}

/** The 32-byte object key of the pinned version; the caller clears it after the download. */
export function openObject(handle: KeyHandle, envelope: ObjectEnvelopeView, pinned: PinnedVersion): Promise<Uint8Array> {
  if (!worker || handle.run !== run) return Promise.reject(new KeyWorkerClosedError())
  if (envelope.version_id !== pinned.versionId) return Promise.reject(new Error('The envelope does not belong to this object.'))
  const input = {
    envelope: fromBase64Url(envelope.envelope.abe),
    context: fromBase64Url(envelope.context.bytes),
    parameters: parameterBytes(handle.parameters),
    expected: { ...pinned, publicKey: fromBase64Url(pinned.publicKey) },
  }
  return call({ op: 'open', handle: handle.id, input })
}

/** The bucket, recipient and signed-in holder a proposal must name. */
export interface IssueExpected {
  bucket: string
  recipient: string
  holder: string
}

/** Issues a holder proposal from the bucket private key; the caller clears its copy. */
export async function issueGrant(
  proposal: AbeRecord<KeyRequestFields>,
  bucketKey: Uint8Array,
  expected: IssueExpected,
): Promise<GrantSubmission> {
  const fields = proposal.fields
  if (!proposal.aad || !fields.recipient_public || fields.restrictions !== null) {
    throw new Error('This key request cannot be issued from the browser.')
  }
  if (
    fields.bucket !== expected.bucket ||
    fields.recipient_user !== expected.recipient ||
    fields.issuer?.kind !== 'user' ||
    fields.issuer.id !== expected.holder
  ) {
    throw new Error('This key request does not belong to this bucket or holder.')
  }
  const input = {
    bucketKey,
    request: fields,
    issuer: fields.issuer,
    parameters: parameterBytes(fields.parameters),
    aad: fromBase64Url(proposal.aad),
    record: fromBase64Url(proposal.record),
  }
  const sealed = await call<SealedSecret>({ op: 'issue', input })
  return { context: proposal.record, enc: toBase64(sealed.enc), ciphertext: toBase64(sealed.ciphertext) }
}
