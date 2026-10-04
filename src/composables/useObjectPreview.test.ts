import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import type { BucketEncryptionResponse, BucketUnlockStatus } from '@/lib/api'
import { useObjectPreview } from './useObjectPreview'

const getObjectText = vi.fn()
const probeAccess = vi.fn()
const getBucketEncryption = vi.fn()

vi.mock('./useS3', () => ({
  useS3: () => ({ getObjectText, probeAccess, downloadUrl: async () => 'https://b.test/presigned' }),
  s3ErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock('./s3/endpoints', () => ({
  localNodeId: () => 'node-a',
  nodeApiBase: (id: string) => `https://${id}.test/api/v1`,
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  getBucketEncryption: (...args: unknown[]) => getBucketEncryption(...args),
}))

const TARGET = { bucket: 'reef', key: 'notes.txt', nodeId: 'node-b' }
const LOCKED = Object.assign(new Error('The object could not be fetched (HTTP 403).'), {
  $metadata: { httpStatusCode: 403 },
  bucketLocked: true,
})

function lockState(state: BucketUnlockStatus['state']): BucketEncryptionResponse {
  const unlock = { state, lock_reason: null, locked_at_ms: null, session_id: null, unlocked_at_ms: null, deadline_ms: null, max_deadline_ms: null }
  return {
    mode: 'vault_locked',
    generations: [{ generation: 2, role: 'active', public_key: 'PK', fingerprint: 'f', unlock }],
  } as BucketEncryptionResponse
}

beforeEach(() => {
  getObjectText.mockReset()
  probeAccess.mockReset().mockResolvedValue('open')
  getBucketEncryption.mockReset()
})

describe('preview of a locked bucket', () => {
  it('waits for a key and links to the Encryption tab on the bucket node', async () => {
    getObjectText.mockRejectedValue(LOCKED)
    const preview = useObjectPreview()

    await preview.load(TARGET)

    expect(preview.status.value).toBe('locked')
    expect(preview.errorMessage.value).toBeNull()
    expect(preview.lockedLink.value).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef' },
      query: { tab: 'encryption', node: 'node-b' },
    })
  })

  it('loads again only after the node reports an unlock', async () => {
    getObjectText.mockRejectedValueOnce(LOCKED)
    const preview = useObjectPreview()
    await preview.load(TARGET)

    getBucketEncryption.mockResolvedValueOnce(lockState('locked'))
    await preview.recheck()
    expect(preview.lockCheck.value).toBe('still')
    expect(getObjectText).toHaveBeenCalledTimes(1)
    expect(getBucketEncryption.mock.calls[0]).toEqual(['reef', { baseUrl: 'https://node-b.test/api/v1', token: expect.any(String) }])

    getBucketEncryption.mockResolvedValueOnce(lockState('unlocked'))
    getObjectText.mockResolvedValueOnce('plain text')
    await preview.recheck()

    expect(preview.status.value).toBe('ready')
    expect(preview.text.value).toBe('plain text')
  })

  it('keeps an ordinary refusal an error', async () => {
    getObjectText.mockRejectedValue(Object.assign(new Error('denied'), { $metadata: { httpStatusCode: 403 } }))
    const preview = useObjectPreview()

    await preview.load(TARGET)

    expect(preview.status.value).toBe('error')
    expect(preview.lockedLink.value).toBeNull()
  })

  it('lets an older load neither end the waiting state of a newer one nor overwrite its content', async () => {
    let failOld!: (reason: unknown) => void
    getObjectText.mockReturnValueOnce(new Promise((_, reject) => (failOld = reject)))
    getObjectText.mockRejectedValueOnce(LOCKED)
    const preview = useObjectPreview()

    const old = preview.load({ ...TARGET, key: 'old.txt' })
    await preview.load(TARGET)
    failOld(new Error('late failure'))
    await old

    expect(preview.status.value).toBe('locked')
    expect(preview.errorMessage.value).toBeNull()

    let answerOld!: (value: string) => void
    getObjectText.mockReturnValueOnce(new Promise((resolve) => (answerOld = resolve)))
    getObjectText.mockResolvedValueOnce('new text')
    const older = preview.load({ ...TARGET, key: 'old.txt' })
    await preview.load(TARGET)
    answerOld('old text')
    await older

    expect(preview.text.value).toBe('new text')
  })

  it('reads one byte before it offers a direct viewer, an oversized download or the download button', async () => {
    probeAccess.mockResolvedValue('locked')
    const preview = useObjectPreview()

    await preview.load({ ...TARGET, key: 'clip.mp4' })
    expect(preview.status.value).toBe('locked')
    expect(preview.directUrl.value).toBeNull()

    await preview.load({ ...TARGET, size: 50 * 1024 * 1024 })
    expect(preview.status.value).toBe('locked')
    expect(getObjectText).not.toHaveBeenCalled()

    probeAccess.mockResolvedValue('open')
    await preview.load({ ...TARGET, key: 'paper.pdf' })
    expect(preview.status.value).toBe('ready')
    probeAccess.mockResolvedValueOnce('locked')
    expect(await preview.checkAccess('https://b.test/presigned', preview.loadToken())).toBe(false)
    expect(preview.status.value).toBe('locked')
    expect(probeAccess).toHaveBeenCalledWith('https://b.test/presigned', expect.any(AbortSignal))
  })

  it('loads again once the node confirms the bucket is plain, and keeps an unreported key state unknown', async () => {
    getObjectText.mockRejectedValueOnce(LOCKED)
    const preview = useObjectPreview()
    await preview.load(TARGET)

    getBucketEncryption.mockResolvedValueOnce({ mode: 'off' } as BucketEncryptionResponse)
    await preview.recheck()
    expect(preview.lockCheck.value).toBe('unknown')
    expect(getObjectText).toHaveBeenCalledTimes(1)

    getBucketEncryption.mockResolvedValueOnce({ mode: 'off', generations: [] } as unknown as BucketEncryptionResponse)
    getObjectText.mockResolvedValueOnce('plain again')
    await preview.recheck()
    expect(preview.status.value).toBe('ready')
    expect(preview.text.value).toBe('plain again')
  })

  it('cancels the probe of an older load and never gives its URL to a newer preview', async () => {
    let answer!: (value: string) => void
    probeAccess.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    getObjectText.mockResolvedValueOnce('newer text')
    const preview = useObjectPreview()

    const media = preview.load({ ...TARGET, key: 'clip.mp4' })
    await vi.waitFor(() => expect(probeAccess).toHaveBeenCalled())
    await preview.load(TARGET)
    answer('open')
    await media

    const signal = probeAccess.mock.calls[0][1] as AbortSignal
    expect(signal.aborted).toBe(true)
    expect(preview.text.value).toBe('newer text')
    expect(preview.directUrl.value).toBeNull()
    expect(preview.status.value).toBe('ready')
  })

  it('lets a check from an older preview neither lock nor link the newer one', async () => {
    const preview = useObjectPreview()
    await preview.load({ ...TARGET, key: 'clip.mp4' })
    const older = preview.loadToken()
    getObjectText.mockResolvedValueOnce('other text')
    await preview.load({ ...TARGET, bucket: 'other', key: 'b.txt' })
    probeAccess.mockResolvedValueOnce('locked')

    expect(await preview.checkAccess('https://b.test/presigned', older, TARGET)).toBe(false)
    expect(preview.status.value).toBe('ready')
    expect(preview.lockedLink.value).toBeNull()

    probeAccess.mockResolvedValueOnce('locked')
    expect(await preview.checkAccess('https://b.test/presigned', preview.loadToken(), TARGET)).toBe(false)
    expect(preview.lockedLink.value).toMatchObject({ params: { bucketId: 'reef' } })
  })

  it('hands out its signed URL only for the object it was signed for', async () => {
    const preview = useObjectPreview()
    const clip = { ...TARGET, key: 'clip.mp4' }
    await preview.load(clip)

    expect(preview.urlFor(clip)).toBe('https://b.test/presigned')
    expect(preview.urlFor({ ...clip, bucket: 'other' })).toBeNull()
    expect(preview.urlFor({ ...clip, nodeId: 'node-c' })).toBeNull()
    expect(preview.urlFor({ ...clip, versionId: 'v2' })).toBeNull()
  })
})
