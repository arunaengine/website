import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AbeRecord, type KeyGrantFields, type ObjectEnvelopeView } from '@/lib/api'
import { ReadWaitError, fetchEnvelope, readWithGrant, requestKey, requestScopes, usableGrant } from './keyedRead'
import { KeyWorkerClosedError } from './keyWorker'

const api = vi.hoisted(() => ({
  getObjectEnvelope: vi.fn(),
  requestScopedKey: vi.fn(),
  listUserKeys: vi.fn(),
  downloadWithKey: vi.fn(),
}))
const worker = vi.hoisted(() => ({ importGrant: vi.fn(), openObject: vi.fn() }))

vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), ...api }))
vi.mock('./keyWorker', async (original) => ({ ...(await original<object>()), ...worker }))

const TARGET = { bucket: 'reef', key: 'raw/a.csv', versionId: 'V1', client: { baseUrl: 'https://node.test/api/v1' } }
const ENVELOPE = {
  version_id: 'V1',
  parameters: { generation: 2, fingerprint: 'F' },
  context: { epoch: 0, write_id: 'W', public_key: 'P' },
} as unknown as ObjectEnvelopeView

function grant(scope: { kind: 'exact' | 'subtree'; value: string }, changes: Record<string, unknown> = {}) {
  const request = { request_id: 'Q1', recipient_record: 'R', parameters: { generation: 2, fingerprint: 'F' }, epochs: [0], scope, ...changes }
  return { fields: { request }, record: '', aad: 'AA==' } as unknown as AbeRecord<KeyGrantFields>
}

beforeEach(() => vi.clearAllMocks())

describe('grant choice', () => {
  it('takes a grant whose scope, generation, fingerprint and epoch fit the version', () => {
    expect(usableGrant([grant({ kind: 'subtree', value: 'raw/' })], ENVELOPE, 'raw/a.csv')).not.toBeNull()
    expect(usableGrant([grant({ kind: 'exact', value: 'raw/a.csv' })], ENVELOPE, 'raw/a.csv')).not.toBeNull()
    for (const other of [
      grant({ kind: 'subtree', value: 'other/' }),
      grant({ kind: 'exact', value: 'raw/b.csv' }),
      grant({ kind: 'subtree', value: '' }, { parameters: { generation: 1, fingerprint: 'F' } }),
      grant({ kind: 'subtree', value: '' }, { parameters: { generation: 2, fingerprint: 'X' } }),
      grant({ kind: 'subtree', value: '' }, { epochs: [1] }),
    ]) {
      expect(usableGrant([other], ENVELOPE, 'raw/a.csv')).toBeNull()
    }
  })

  it('asks for the bucket, then the folder, then the file', () => {
    expect(requestScopes('raw/x/a.csv')).toEqual([
      { kind: 'subtree', value: '' },
      { kind: 'subtree', value: 'raw/x/' },
      { kind: 'exact', value: 'raw/x/a.csv' },
    ])
    expect(requestScopes('a.csv')).toEqual([{ kind: 'subtree', value: '' }, { kind: 'exact', value: 'a.csv' }])
  })
})

describe('key requests', () => {
  it('narrows the scope after a refusal and reports an open request as no grant', async () => {
    api.requestScopedKey
      .mockRejectedValueOnce(new ApiError(403, 'denied'))
      .mockResolvedValueOnce({ kind: 'pending', request: {} })
    expect(await requestKey(TARGET)).toBeNull()
    expect(api.requestScopedKey.mock.calls.map((call) => call[1])).toEqual([
      { kind: 'subtree', value: '' },
      { kind: 'subtree', value: 'raw/' },
    ])
  })

  it('returns a grant an unlocked bucket issued at once and keeps other failures', async () => {
    const issued = grant({ kind: 'subtree', value: '' })
    api.requestScopedKey.mockResolvedValueOnce({ kind: 'grant', grant: issued })
    expect(await requestKey(TARGET)).toBe(issued)
    api.requestScopedKey.mockRejectedValueOnce(new ApiError(422, 'policies', 'scope_unsupported'))
    await expect(requestKey(TARGET)).rejects.toMatchObject({ code: 'scope_unsupported' })
  })

  it('maps a version without an envelope to the prepared copy wait', async () => {
    api.getObjectEnvelope.mockRejectedValueOnce(new ApiError(409, 'unlock needed', 'envelope_pending'))
    await expect(fetchEnvelope(TARGET)).rejects.toEqual(new ReadWaitError('preparing'))
  })
})

describe('reading with a grant', () => {
  it('opens the pinned version, sends its key once and clears it', async () => {
    const pair = { publicKey: new Uint8Array(32), privateKey: {} } as never
    const objectKey = new Uint8Array(32).fill(9)
    api.listUserKeys.mockResolvedValue({ keys: [{ record_id: 'R', key_id: 'K' }] })
    worker.importGrant.mockResolvedValue({ run: 1, id: 1 })
    worker.openObject.mockResolvedValueOnce(objectKey)
    api.downloadWithKey.mockResolvedValueOnce(new Blob(['ok']))
    const vault = { openUserKey: vi.fn(async () => pair) }

    const blob = await readWithGrant(TARGET, ENVELOPE, grant({ kind: 'subtree', value: 'raw/' }), 'U', vault)

    expect(await blob.text()).toBe('ok')
    expect(vault.openUserKey).toHaveBeenCalledWith('K')
    expect(worker.openObject.mock.calls[0]![2]).toEqual({ versionId: 'V1', objectKey: 'raw/a.csv', epoch: 0, writeId: 'W', publicKey: 'P' })
    expect(api.downloadWithKey.mock.calls[0]![0]).toMatchObject({ bucket: 'reef', key: 'raw/a.csv', versionId: 'V1' })
    expect(objectKey.every((byte) => byte === 0)).toBe(true)
  })

  it('imports the grant again once after the vault closed the worker', async () => {
    api.listUserKeys.mockResolvedValue({ keys: [{ record_id: 'R', key_id: 'K' }] })
    worker.importGrant.mockResolvedValue({ run: 2, id: 1 })
    worker.openObject.mockRejectedValueOnce(new KeyWorkerClosedError()).mockResolvedValueOnce(new Uint8Array(32))
    api.downloadWithKey.mockResolvedValueOnce(new Blob(['ok']))
    const vault = { openUserKey: vi.fn(async () => ({ publicKey: new Uint8Array(32), privateKey: {} }) as never) }
    const fresh = grant({ kind: 'subtree', value: '' }, { request_id: 'Q9' })

    await readWithGrant(TARGET, ENVELOPE, fresh, 'U', vault)

    expect(worker.importGrant).toHaveBeenCalledTimes(2)
  })

  it('stops before the import when the vault closes during key opening', async () => {
    api.listUserKeys.mockResolvedValue({ keys: [{ record_id: 'R', key_id: 'K' }] })
    let open = true
    const vault = {
      openUserKey: vi.fn(async () => {
        open = false
        return { publicKey: new Uint8Array(32), privateKey: {} } as never
      }),
    }
    const guard = () => {
      if (!open) throw new Error('closed')
    }
    const fresh = grant({ kind: 'subtree', value: '' }, { request_id: 'Q7' })

    await expect(readWithGrant(TARGET, ENVELOPE, fresh, 'U', vault, guard)).rejects.toThrow('closed')

    expect(worker.importGrant).not.toHaveBeenCalled()
    expect(api.downloadWithKey).not.toHaveBeenCalled()
  })

  it('sends no key once the read ended after opening and passes the abort signal', async () => {
    api.listUserKeys.mockResolvedValue({ keys: [{ record_id: 'R', key_id: 'K' }] })
    worker.importGrant.mockResolvedValue({ run: 3, id: 1 })
    const objectKey = new Uint8Array(32).fill(5)
    let open = true
    worker.openObject.mockImplementationOnce(async () => {
      open = false
      return objectKey
    })
    const vault = { openUserKey: vi.fn(async () => ({ publicKey: new Uint8Array(32), privateKey: {} }) as never) }
    const guard = () => {
      if (!open) throw new Error('ended')
    }
    const fresh = grant({ kind: 'subtree', value: '' }, { request_id: 'Q8' })

    await expect(readWithGrant(TARGET, ENVELOPE, fresh, 'U', vault, guard)).rejects.toThrow('ended')
    expect(api.downloadWithKey).not.toHaveBeenCalled()
    expect(objectKey.every((byte) => byte === 0)).toBe(true)

    const signal = new AbortController().signal
    worker.openObject.mockResolvedValueOnce(new Uint8Array(32))
    api.downloadWithKey.mockResolvedValueOnce(new Blob(['ok']))
    await readWithGrant(TARGET, ENVELOPE, fresh, 'U', vault, () => {}, signal)
    expect(api.downloadWithKey.mock.calls[0]![0].signal).toBe(signal)
  })
})
