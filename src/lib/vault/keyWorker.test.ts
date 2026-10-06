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

const PINNED = { versionId: 'V', objectKey: 'foo/file', epoch: 1, writeId: 'W', publicKey: 'AQ==' }
const ISSUE = { bucket: 'reef', recipient: 'U', holder: 'H' }

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
    const imported = importGrant(GRANT, PAIR, REQUEST)
    const worker = latest()
    const [message] = worker.posted
    expect(message.op).toBe('import')
    expect(message.input.sealed).toEqual({ enc: Uint8Array.of(10, 11, 12), ciphertext: Uint8Array.of(13, 14, 15) })
    expect(message.input.aad).toEqual(Uint8Array.of(16, 17, 18))
    expect(message.input).toMatchObject({ request: REQUEST, issuer: { kind: 'node', id: 'N' } })
    expect(message.input.parameters).toEqual({
      parameters: Uint8Array.of(3, 4), context: Uint8Array.of(5, 6), fingerprint: Uint8Array.of(1, 2),
    })
    worker.reply({ id: message.id, value: 7 })
    const handle = await imported

    const opened = openObject(handle, ENVELOPE, PINNED)
    const open = worker.posted[1]
    expect(FakeWorker.started).toHaveLength(1)
    expect(open).toMatchObject({ op: 'open', handle: 7, input: { expected: { objectKey: 'foo/file', epoch: 1, writeId: 'W' } } })
    expect(open.input.envelope).toEqual(Uint8Array.of(22, 23, 24))
    expect(open.input.expected).toMatchObject({ publicKey: Uint8Array.of(1) })
    worker.reply({ id: open.id, value: Uint8Array.of(9) })
    await expect(opened).resolves.toEqual(Uint8Array.of(9))
  })

  it('refuses an envelope for another version without asking the worker', async () => {
    const imported = importGrant(GRANT, PAIR, REQUEST)
    latest().reply({ id: latest().posted[0].id, value: 1 })
    const handle = await imported
    await expect(openObject(handle, { ...ENVELOPE, version_id: 'OLD' }, PINNED)).rejects.toThrow('does not belong')
    expect(latest().posted).toHaveLength(1)
  })

  it('turns a worker refusal into an error', async () => {
    const imported = importGrant(GRANT, PAIR, REQUEST)
    latest().reply({ id: latest().posted[0].id, error: 'The key grant does not belong to this key or bucket.' })
    await expect(imported).rejects.toThrow('does not belong')
  })

  it('ends the worker and its pending calls on close, and refuses its old handles', async () => {
    const first = importGrant(GRANT, PAIR, REQUEST)
    const worker = latest()
    worker.reply({ id: worker.posted[0].id, value: 1 })
    const handle = await first
    const pending = importGrant(GRANT, PAIR, REQUEST)

    closeKeyWorker()

    expect(worker.terminated).toBe(true)
    await expect(pending).rejects.toBeInstanceOf(KeyWorkerClosedError)
    await expect(openObject(handle, ENVELOPE, PINNED)).rejects.toBeInstanceOf(KeyWorkerClosedError)
    const again = importGrant(GRANT, PAIR, REQUEST)
    expect(FakeWorker.started).toHaveLength(2)
    latest().reply({ id: latest().posted[0].id, value: 1 })
    await expect(openObject(handle, ENVELOPE, PINNED)).rejects.toBeInstanceOf(KeyWorkerClosedError)
    await again
  })

  it('closes on a worker error', async () => {
    const pending = importGrant(GRANT, PAIR, REQUEST)
    latest().onerror?.()
    await expect(pending).rejects.toBeInstanceOf(KeyWorkerClosedError)
    expect(latest().terminated).toBe(true)
  })

  it('issues a proposal and echoes its record as the grant context', async () => {
    const proposal = { fields: { ...REQUEST, issuer: { kind: 'user' as const, id: 'H' } }, record: 'cmVj', aad: 'EBES' }
    const bucketKey = new Uint8Array(32).fill(1)
    const issued = issueGrant(proposal, bucketKey, ISSUE)
    const message = latest().posted[0]
    expect(message.op).toBe('issue')
    expect(message.input).toMatchObject({ request: proposal.fields, issuer: { kind: 'user', id: 'H' }, bucketKey })
    latest().reply({ id: message.id, value: { enc: Uint8Array.of(1), ciphertext: Uint8Array.of(2, 3) } })
    await expect(issued).resolves.toEqual({ context: 'cmVj', enc: 'AQ==', ciphertext: 'AgM=' })
  })

  it('does not issue restricted, credential or keyless requests', async () => {
    for (const change of [{ restrictions: [] }, { credential_id: 'C' }, { recipient_public: null }]) {
      const proposal = { fields: { ...REQUEST, ...change }, record: 'cmVj', aad: 'EBES' }
      await expect(issueGrant(proposal, new Uint8Array(32), ISSUE)).rejects.toThrow('cannot be issued')
    }
    expect(FakeWorker.started).toHaveLength(0)
  })

  it('does not issue a proposal for another bucket, recipient or holder', async () => {
    const fields = { ...REQUEST, issuer: { kind: 'user' as const, id: 'H' } }
    for (const change of [{ bucket: 'other' }, { recipient_user: 'X' }, { issuer: { kind: 'user' as const, id: 'X' } }, { issuer: undefined }]) {
      const proposal = { fields: { ...fields, ...change }, record: 'cmVj', aad: 'EBES' }
      await expect(issueGrant(proposal, new Uint8Array(32), ISSUE)).rejects.toThrow('does not belong')
    }
    expect(FakeWorker.started).toHaveLength(0)
  })
})
