import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { ApiError, type BucketSearchHit } from '@/lib/api'
import type { ObjectEntry } from '@/composables/useS3'
import { useOtherBuckets } from './useOtherBuckets'

const createSyncRelationship = vi.fn()
const apiBaseUrl = ref('https://a.test/api/v1')
const sessionEpoch = ref(0)
const sourceEncrypted = ref<boolean | null>(null)
const sourceArgs: unknown[][] = []

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl, sessionEpoch, createSyncRelationship }),
}))
vi.mock('@/composables/useRealmNodes', () => ({
  useRealmNodes: () => ({
    localNodeId: ref('node-a'),
    isLocalNode: (id: string) => id === 'node-a',
    nodeById: (id: string) => ({ 'node-b': { apiBase: 'https://b.test/api/v1' } })[id] ?? null,
    displayName: (id: string) => id,
  }),
}))
vi.mock('@/composables/useEncryptedSource', () => ({
  useEncryptedSource: (...args: unknown[]) => {
    sourceArgs.push(args)
    return sourceEncrypted
  },
}))

function hit(bucket: string, nodeId: string): BucketSearchHit {
  return { arn: `arn:aruna:r:${nodeId}:s3/${bucket}`, bucket, node_id: nodeId, group_id: 'G1', created_at: '' }
}

function objects(...keys: string[]) {
  return { objects: keys.map((key) => ({ key }) as ObjectEntry), folders: [] }
}

let scope = effectScope()

function imports() {
  return scope.run(() => useOtherBuckets({ open: ref(true), bucket: ref('inbox'), prefix: ref('in/') }))!
}

beforeEach(() => {
  apiBaseUrl.value = 'https://a.test/api/v1'
  sessionEpoch.value = 0
  sourceEncrypted.value = null
  sourceArgs.length = 0
  createSyncRelationship.mockReset().mockResolvedValue({ id: 's-1' })
})

afterEach(() => {
  scope.stop()
  scope = effectScope()
})

describe('imports from other buckets', () => {
  it('reads the browsed source on its own node', () => {
    const state = imports()
    state.pickSearchHit(hit('sealed', 'node-b'))
    const [bucket, apiBase] = sourceArgs[0] as [{ value: string }, { value: string | null }]

    expect(bucket.value).toBe('sealed')
    expect(apiBase.value).toBe('https://b.test/api/v1')
    state.pickSearchHit(hit('local', 'node-a'))
    expect(apiBase.value).toBe('https://a.test/api/v1')
  })

  it('stores a copy of an encrypted source unencrypted only when the row asks for it', async () => {
    const state = imports()
    state.pickSearchHit(hit('sealed', 'node-b'))
    sourceEncrypted.value = true
    await nextTick()
    state.addOtherSelection(objects('a.txt', 'b.txt', 'c.txt'))
    const [chosen, kept, reference] = state.otherRows.value
    chosen.plaintext = true
    reference.plaintext = true
    reference.mode = 'reference'

    expect(state.offerPlaintext(chosen)).toBe(true)
    expect(state.offerPlaintext(reference)).toBe(false)
    expect(state.plaintextChosen.value).toBe(true)
    await state.createOtherRelationships()

    const sent = createSyncRelationship.mock.calls.map(([request]) => request)
    expect(sent[0]).toMatchObject({ source: { bucket: 'sealed', prefix: 'a.txt' }, plaintext: true })
    expect(createSyncRelationship.mock.calls[0][1]).toEqual({ baseUrl: 'https://b.test/api/v1' })
    expect(sent[1]).not.toHaveProperty('plaintext')
    expect(sent[2]).not.toHaveProperty('plaintext')
    expect(kept.plaintext).toBe(false)
  })

  it('keeps the state of an earlier source and offers nothing for a plain or unknown one', async () => {
    const state = imports()
    state.pickSearchHit(hit('sealed', 'node-b'))
    sourceEncrypted.value = true
    await nextTick()
    state.addOtherSelection(objects('a.txt'))
    state.pickSearchHit(hit('plain', 'node-a'))
    sourceEncrypted.value = false
    await nextTick()
    state.addOtherSelection(objects('b.txt'))
    state.pickSearchHit(hit('unknown', 'node-b'))
    sourceEncrypted.value = null
    await nextTick()
    state.addOtherSelection(objects('c.txt'))

    expect(state.otherRows.value.map(state.offerPlaintext)).toEqual([true, false, false])
    expect(state.plaintextOffered.value).toBe(true)
  })

  it.each(['session', 'API'])('clears plaintext consent and observations on a %s change', async (context) => {
    const state = imports()
    state.pickSearchHit(hit('sealed', 'node-a'))
    sourceEncrypted.value = true
    await nextTick()
    state.addOtherSelection(objects('a.txt'))
    const row = state.otherRows.value[0]
    row.plaintext = true

    if (context === 'session') sessionEpoch.value += 1
    else apiBaseUrl.value = 'https://c.test/api/v1'

    expect(row.plaintext).toBe(false)
    expect(state.offerPlaintext(row)).toBe(false)
    expect(state.otherRows.value).toEqual([row])
    expect(state.sourceBucket.value).toBe('sealed')
    sourceEncrypted.value = null
    await nextTick()
    sourceEncrypted.value = true
    await nextTick()
    await state.createOtherRelationships()

    expect(state.offerPlaintext(row)).toBe(true)
    expect(createSyncRelationship.mock.calls[0][0]).not.toHaveProperty('plaintext')
  })

  it.each(['session', 'API'])('stops a deferred batch after a %s change', async (context) => {
    const state = imports()
    state.pickSearchHit(hit('sealed', 'node-a'))
    sourceEncrypted.value = true
    await nextTick()
    state.addOtherSelection(objects('a.txt', 'b.txt'))
    state.otherRows.value.forEach((row) => (row.plaintext = true))
    let refuse: (cause: unknown) => void = () => undefined
    createSyncRelationship.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)))
    const pending = state.createOtherRelationships()
    expect(createSyncRelationship.mock.calls[0][0]).toHaveProperty('plaintext', true)

    if (context === 'session') sessionEpoch.value += 1
    else apiBaseUrl.value = 'https://c.test/api/v1'
    refuse(new DOMException('The API session changed.', 'AbortError'))
    await pending

    expect(createSyncRelationship).toHaveBeenCalledTimes(1)
    expect(state.otherRows.value.map((row) => row.plaintext)).toEqual([false, false])
    expect(state.otherRows.value.map((row) => row.state)).toEqual(['error', 'ready'])
    expect(state.otherBusy.value).toBe(false)
  })

  it('names a refused copy of an encrypted source by its code', async () => {
    const state = imports()
    state.pickSearchHit(hit('sealed', 'node-b'))
    state.addOtherSelection(objects('a.txt', 'b.txt', 'c.txt'))
    createSyncRelationship
      .mockRejectedValueOnce(new ApiError(403, 'forbidden', 'plaintext_required'))
      .mockRejectedValueOnce(new ApiError(403, 'forbidden', 'not_holder'))
      .mockRejectedValueOnce(new ApiError(403, 'forbidden'))

    await state.createOtherRelationships()

    expect(state.otherRows.value.map((row) => row.error)).toEqual([
      'The source bucket is encrypted and the target bucket is not, so the copy was refused. A key holder of the source bucket may store it unencrypted instead.',
      'Only key holders of the source bucket may store a copy unencrypted.',
      'You need read access on the source bucket to import from it.',
    ])
  })
})
