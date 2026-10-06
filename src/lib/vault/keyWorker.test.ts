import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AbeParametersView, AbeRecord, KeyGrantFields, KeyRequestFields, ObjectEnvelopeView } from '@/lib/api'
import { KeyWorkerClosedError, closeKeyWorker, importGrant, issueGrant, openObject } from './keyWorker'
import type { X25519Pair } from './hpke'

interface Posted {
  id: number
  op: string
  handle?: number
  input: Record<string, unknown>
}

class FakeWorker {
  static started: FakeWorker[] = []
  posted: Posted[] = []
  terminated = false
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeWorker.started.push(this)
  }
  postMessage(message: Posted) {
    this.posted.push(message)
  }
  terminate() {
    this.terminated = true
  }
  reply(data: object) {
    this.onmessage?.({ data })
  }
}

const PARAMETERS: AbeParametersView = {
  realm_id: 'R', node_id: 'N', bucket_id: 'B', generation: 1,
  fingerprint: 'AQI=', parameters: 'AwQ=', epoch: 1, context: 'BQY=',
}

const REQUEST: KeyRequestFields = {
  request_id: 'Q1', requesting_user: 'U', recipient_user: 'U', recipient_record: 'K',
  recipient_public: 'BwgJ', recipient_fingerprint: 'AA==', bucket: 'reef', parameters: PARAMETERS,
  scope: { kind: 'subtree', value: 'foo/' }, epochs: [1, 2], credential_id: null, restrictions: null,
  revisions: [], created_at_ms: 1,
}

const GRANT: AbeRecord<KeyGrantFields> = {
  fields: { request: REQUEST, issuer: { kind: 'node', id: 'N' }, enc: 'CgsM', ciphertext: 'DQ4P' },
  record: 'AA==',
  aad: 'EBES',
}

const ENVELOPE = {
  version_id: 'V',
  context: { bytes: 'ExQV' },
  parameters: PARAMETERS,
  envelope: { abe: 'FhcY', recovery_enc: '', recovery_ciphertext: '' },
} as ObjectEnvelopeView

const PAIR = { publicKey: new Uint8Array(32) } as X25519Pair

function latest(): FakeWorker {
  return FakeWorker.started[FakeWorker.started.length - 1]
}

beforeEach(() => {
  FakeWorker.started = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  closeKeyWorker()
  vi.unstubAllGlobals()
})

describe('key worker client', () => {
  it('starts one worker lazily and sends grants as bytes', async () => {
    expect(FakeWorker.started).toHaveLength(0)
    const imported = importGrant(GRANT, PAIR)
    const worker = latest()
    const [message] = worker.posted
    expect(message.op).toBe('import')
    expect(message.input.sealed).toEqual({ enc: Uint8Array.of(10, 11, 12), ciphertext: Uint8Array.of(13, 14, 15) })
    expect(message.input.aad).toEqual(Uint8Array.of(16, 17, 18))
    expect(message.input.parameters).toEqual({
      parameters: Uint8Array.of(3, 4), context: Uint8Array.of(5, 6), fingerprint: Uint8Array.of(1, 2),
    })
    worker.reply({ id: message.id, value: 7 })
    const handle = await imported

    const opened = openObject(handle, ENVELOPE, 'foo/file')
    const open = worker.posted[1]
    expect(FakeWorker.started).toHaveLength(1)
    expect(open).toMatchObject({ op: 'open', handle: 7, input: { objectKey: 'foo/file' } })
    expect(open.input.envelope).toEqual(Uint8Array.of(22, 23, 24))
    worker.reply({ id: open.id, value: Uint8Array.of(9) })
    await expect(opened).resolves.toEqual(Uint8Array.of(9))
  })

  it('turns a worker refusal into an error', async () => {
    const imported = importGrant(GRANT, PAIR)
    latest().reply({ id: latest().posted[0].id, error: 'The key grant does not belong to this key or bucket.' })
    await expect(imported).rejects.toThrow('does not belong')
  })

  it('ends the worker and its pending calls on close, and refuses its old handles', async () => {
    const first = importGrant(GRANT, PAIR)
    const worker = latest()
    worker.reply({ id: worker.posted[0].id, value: 1 })
    const handle = await first
    const pending = importGrant(GRANT, PAIR)

    closeKeyWorker()

    expect(worker.terminated).toBe(true)
    await expect(pending).rejects.toBeInstanceOf(KeyWorkerClosedError)
    await expect(openObject(handle, ENVELOPE, 'foo/file')).rejects.toBeInstanceOf(KeyWorkerClosedError)
    const again = importGrant(GRANT, PAIR)
    expect(FakeWorker.started).toHaveLength(2)
    latest().reply({ id: latest().posted[0].id, value: 1 })
    await expect(openObject(handle, ENVELOPE, 'foo/file')).rejects.toBeInstanceOf(KeyWorkerClosedError)
    await again
  })

  it('closes on a worker error', async () => {
    const pending = importGrant(GRANT, PAIR)
    latest().onerror?.()
    await expect(pending).rejects.toBeInstanceOf(KeyWorkerClosedError)
    expect(latest().terminated).toBe(true)
  })

  it('issues a proposal and echoes its record as the grant context', async () => {
    const proposal = { fields: { ...REQUEST, issuer: { kind: 'user' as const, id: 'H' } }, record: 'cmVj', aad: 'EBES' }
    const bucketKey = new Uint8Array(32).fill(1)
    const issued = issueGrant(proposal, bucketKey)
    const message = latest().posted[0]
    expect(message.op).toBe('issue')
    expect(message.input).toMatchObject({ scope: { kind: 'subtree', value: 'foo/' }, epochs: [1, 2], bucketKey })
    expect(message.input.recipient).toEqual(Uint8Array.of(7, 8, 9))
    latest().reply({ id: message.id, value: { enc: Uint8Array.of(1), ciphertext: Uint8Array.of(2, 3) } })
    await expect(issued).resolves.toEqual({ context: 'cmVj', enc: 'AQ==', ciphertext: 'AgM=' })
  })

  it('does not issue restricted, credential or keyless requests', async () => {
    for (const change of [{ restrictions: [] }, { credential_id: 'C' }, { recipient_public: null }]) {
      const proposal = { fields: { ...REQUEST, ...change }, record: 'cmVj', aad: 'EBES' }
      await expect(issueGrant(proposal, new Uint8Array(32))).rejects.toThrow('cannot be issued')
    }
    expect(FakeWorker.started).toHaveLength(0)
  })
})
