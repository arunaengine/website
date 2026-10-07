import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { NoUsableCopyError, VaultClosedError } from './bucketUnlock'
import { issueBucket } from './keyIssue'

const api = vi.hoisted(() => ({
  listKeyRequests: vi.fn(),
  submitKeyGrant: vi.fn(),
  getBucketEncryption: vi.fn(),
}))
const openBucketKey = vi.hoisted(() => vi.fn())
const issueGrant = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), ...api }))
vi.mock('./bucketUnlock', async (original) => ({ ...(await original<object>()), openBucketKey }))
vi.mock('./keyWorker', () => ({ issueGrant }))

const TARGET = { bucket: 'reef', nodeId: 'ab', client: { baseUrl: 'https://node.test/api/v1' } }
const HOLDER = { realmId: 'realm', userId: 'H' }
const VAULT = { checkKey: vi.fn(), openUserKey: vi.fn(), whileUnlocked: () => () => true }

function proposal(id: string, recipient: string, generation = 2) {
  return { fields: { request_id: id, recipient_user: recipient, parameters: { generation } }, record: id, aad: 'AA==' }
}

let bucketKey: Uint8Array

beforeEach(() => {
  vi.clearAllMocks()
  bucketKey = new Uint8Array(32).fill(7)
  openBucketKey.mockResolvedValue(bucketKey)
  issueGrant.mockImplementation(async (record: { record: string }) => ({ context: record.record, enc: 'e', ciphertext: 'c' }))
  api.submitKeyGrant.mockResolvedValue({})
  api.getBucketEncryption.mockResolvedValue({
    mode: 'vault_locked',
    bucket_id: 'B',
    generations: [{ generation: 2, role: 'active', public_key: 'pk', fingerprint: 'f', unlock: { state: 'locked' } }],
  })
})

describe('holder issuance', () => {
  it('issues every open request of all pages and clears the bucket key', async () => {
    api.listKeyRequests
      .mockResolvedValueOnce({ records: [proposal('Q1', 'ada')], next_cursor: 'next' })
      .mockResolvedValueOnce({ records: [proposal('Q2', 'bob')], next_cursor: null })
    const users = await issueBucket(TARGET, HOLDER, VAULT, () => {})
    expect([...users]).toEqual(['ada', 'bob'])
    expect(api.listKeyRequests).toHaveBeenLastCalledWith('reef', 'next', TARGET.client)
    expect(openBucketKey).toHaveBeenCalledTimes(1)
    expect(openBucketKey.mock.calls[0]![0]).toMatchObject({ context: { bucketId: 'B', generation: 2, userId: 'H' }, publicKey: 'pk' })
    expect(issueGrant.mock.calls[1]![2]).toEqual({ bucket: 'reef', recipient: 'bob', holder: 'H' })
    expect(api.submitKeyGrant).toHaveBeenCalledWith('reef', 'Q2', { context: 'Q2', enc: 'e', ciphertext: 'c' }, TARGET.client)
    expect(bucketKey.every((byte) => byte === 0)).toBe(true)
  })

  it('gives nothing for a bucket the user does not hold or without a usable copy', async () => {
    api.listKeyRequests.mockRejectedValueOnce(new ApiError(403, 'not a key holder'))
    expect((await issueBucket(TARGET, HOLDER, VAULT, () => {})).size).toBe(0)
    api.listKeyRequests.mockResolvedValueOnce({ records: [proposal('Q1', 'ada')], next_cursor: null })
    openBucketKey.mockRejectedValueOnce(new NoUsableCopyError('none'))
    expect((await issueBucket(TARGET, HOLDER, VAULT, () => {})).size).toBe(0)
    expect(api.submitKeyGrant).not.toHaveBeenCalled()
  })

  it('leaves a refused request open and still issues the others', async () => {
    api.listKeyRequests.mockResolvedValueOnce({ records: [proposal('Q1', 'ada'), proposal('Q2', 'bob')], next_cursor: null })
    api.submitKeyGrant.mockRejectedValueOnce(new ApiError(409, 'stale', 'stale_request'))
    expect([...(await issueBucket(TARGET, HOLDER, VAULT, () => {}))]).toEqual(['bob'])
  })

  it('stops at once when the vault closes and still clears the key', async () => {
    api.listKeyRequests.mockResolvedValueOnce({ records: [proposal('Q1', 'ada'), proposal('Q2', 'bob')], next_cursor: null })
    let open = true
    issueGrant.mockImplementationOnce(async () => {
      open = false
      throw new Error('The encryption keys were closed.')
    })
    const guard = () => {
      if (!open) throw new VaultClosedError()
    }
    await expect(issueBucket(TARGET, HOLDER, VAULT, guard)).rejects.toBeInstanceOf(VaultClosedError)
    expect(issueGrant).toHaveBeenCalledTimes(1)
    expect(bucketKey.every((byte) => byte === 0)).toBe(true)
  })

  it('calls no worker once the vault closed while the bucket key opened', async () => {
    api.listKeyRequests.mockResolvedValueOnce({ records: [proposal('Q1', 'ada')], next_cursor: null })
    let open = true
    openBucketKey.mockImplementationOnce(async () => {
      open = false
      return bucketKey
    })
    const guard = () => {
      if (!open) throw new VaultClosedError()
    }
    await expect(issueBucket(TARGET, HOLDER, VAULT, guard)).rejects.toBeInstanceOf(VaultClosedError)
    expect(issueGrant).not.toHaveBeenCalled()
    expect(bucketKey.every((byte) => byte === 0)).toBe(true)
  })
})
