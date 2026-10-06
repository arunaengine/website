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

/** Opens one of the caller's grants with the vault key it is sealed to. */
export async function importGrant(grant: AbeRecord<KeyGrantFields>, pair: X25519Pair): Promise<KeyHandle> {
  if (!grant.aad) throw new Error('The key grant has no associated data.')
  const input = {
    sealed: { enc: fromBase64Url(grant.fields.enc), ciphertext: fromBase64Url(grant.fields.ciphertext) },
    aad: fromBase64Url(grant.aad),
    pair,
    parameters: parameterBytes(grant.fields.request.parameters),
  }
  const id = await call<number>({ op: 'import', input })
  return { run, id }
}

/** The 32-byte object key of one version; the caller clears it after the download. */
export function openObject(handle: KeyHandle, envelope: ObjectEnvelopeView, objectKey: string): Promise<Uint8Array> {
  if (!worker || handle.run !== run) return Promise.reject(new KeyWorkerClosedError())
  const input = {
    envelope: fromBase64Url(envelope.envelope.abe),
    context: fromBase64Url(envelope.context.bytes),
    parameters: parameterBytes(envelope.parameters),
    objectKey,
  }
  return call({ op: 'open', handle: handle.id, input })
}

/** Issues a holder proposal from the bucket private key; the caller clears its copy. */
export async function issueGrant(proposal: AbeRecord<KeyRequestFields>, bucketKey: Uint8Array): Promise<GrantSubmission> {
  const fields = proposal.fields
  if (!proposal.aad || !fields.recipient_public || fields.credential_id !== null || fields.restrictions !== null) {
    throw new Error('This key request cannot be issued from the browser.')
  }
  const input = {
    bucketKey,
    parameters: parameterBytes(fields.parameters),
    scope: fields.scope,
    epochs: fields.epochs,
    recipient: fromBase64Url(fields.recipient_public),
    aad: fromBase64Url(proposal.aad),
  }
  const sealed = await call<SealedSecret>({ op: 'issue', input })
  return { context: proposal.record, enc: toBase64(sealed.enc), ciphertext: toBase64(sealed.ciphertext) }
}
