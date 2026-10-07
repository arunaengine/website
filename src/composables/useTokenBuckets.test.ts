import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import * as Api from '@/lib/api'
import { apiBaseUrl, authToken, sessionEpoch } from './aruna/state'
import { useTokenBuckets } from './useTokenBuckets'

const listGroupDataPaths = vi.fn()
const getBucketEncryption = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  listGroupDataPaths: (...args: unknown[]) => listGroupDataPaths(...args),
  getBucketEncryption: (...args: unknown[]) => getBucketEncryption(...args),
}))

const UNLOCKED: Api.BucketUnlockStatus = {
  state: 'unlocked',
  lock_reason: null,
  locked_at_ms: null,
  session_id: 'S1',
  unlocked_at_ms: 1,
  deadline_ms: null,
  max_deadline_ms: null,
}

function status(overrides: Partial<Api.BucketEncryptionResponse> = {}): Api.BucketEncryptionResponse {
  return {
    bucket: 'reef',
    mode: 'vault_locked',
    bucket_id: 'B1',
    storage_generation: 1,
    key_generation: 2,
    public_key: 'PK',
    fingerprint: 'ff',
    cipher: 'chacha20_poly1305',
    block_keys: 'content_derived',
    max_unlock_ms: null,
    unlock: UNLOCKED,
    holders: null,
    recovery: null,
    transition: null,
    caller: { holder: true, ready_copy: true, admin: false },
    ...overrides,
  }
}

function folders(...names: string[]) {
  return names.map((name) => ({ permission_path: `/realm/g/G1/data/node-a/${name}/`, kind: 'folder' }))
}

const STATES: Record<string, Api.BucketEncryptionResponse> = {
  held: status(),
  locked: status({ unlock: { ...UNLOCKED, state: 'locked', session_id: null } }),
  plain: status({ mode: 'off', unlock: null }),
  foreign: status({ caller: { holder: false, ready_copy: false, admin: true } }),
}

async function settle() {
  for (let round = 0; round < 6; round += 1) await nextTick()
}

let scope = effectScope()

beforeEach(() => {
  apiBaseUrl.value = 'https://a.test/api/v1'
  authToken.value = 'bearer-a'
  listGroupDataPaths.mockReset().mockResolvedValue({ entries: folders('held', 'locked', 'plain', 'foreign', 'gone') })
  getBucketEncryption.mockReset().mockImplementation(async (name: string) => {
    if (!STATES[name]) throw new Api.ApiError(404, 'not found')
    return STATES[name]
  })
})

afterEach(() => {
  scope.stop()
  scope = effectScope()
})

describe('buckets for a session token', () => {
  it('offers every encrypted bucket and counts the unchecked ones', async () => {
    const choices = scope.run(() => useTokenBuckets(ref('G1'), ref(true)))!
    await settle()

    expect(listGroupDataPaths).toHaveBeenCalledWith(
      'G1',
      { delimiter: '/', limit: 1000 },
      { baseUrl: 'https://a.test/api/v1', token: 'bearer-a' },
    )
    expect(choices.state.value).toBe('ready')
    expect(choices.buckets.value).toEqual(['held', 'locked', 'foreign'])
    expect(choices.unchecked.value).toBe(1)
    expect(choices.partial.value).toBe(false)
  })

  it('says when only the first page of buckets was checked', async () => {
    listGroupDataPaths.mockResolvedValue({ entries: folders('held'), continuation_token: 'next' })
    const choices = scope.run(() => useTokenBuckets(ref('G1'), ref(true)))!
    await settle()

    expect(choices.partial.value).toBe(true)
  })

  it('asks nothing until a group is chosen and the choice is open', async () => {
    const group = ref('')
    const open = ref(false)
    const choices = scope.run(() => useTokenBuckets(group, open))!
    group.value = 'G1'
    await settle()

    expect(choices.state.value).toBe('idle')
    expect(listGroupDataPaths).not.toHaveBeenCalled()
  })

  it('drops an answer for a group or session that changed meanwhile', async () => {
    let answer: (value: unknown) => void = () => undefined
    listGroupDataPaths.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const group = ref('G1')
    const choices = scope.run(() => useTokenBuckets(group, ref(true)))!

    listGroupDataPaths.mockResolvedValueOnce({ entries: [] })
    group.value = 'G2'
    await settle()
    answer({ entries: folders('held') })
    await settle()

    expect(choices.buckets.value).toEqual([])
    expect(choices.state.value).toBe('ready')

    sessionEpoch.value += 1
    await nextTick()
    expect(choices.state.value).toBe('loading')
  })

  it('keeps loaded choices when collapsed and reopened', async () => {
    const open = ref(true)
    const choices = scope.run(() => useTokenBuckets(ref('G1'), open))!
    await settle()

    open.value = false
    await settle()
    expect(choices.buckets.value).toEqual(['held', 'locked', 'foreign'])
    expect(choices.state.value).toBe('ready')
    expect(choices.unchecked.value).toBe(1)

    open.value = true
    await settle()
    expect(choices.buckets.value).toEqual(['held', 'locked', 'foreign'])
    expect(listGroupDataPaths).toHaveBeenCalledTimes(1)
  })

  it.each(['group', 'session', 'API'])('clears collapsed choices after a %s change', async (context) => {
    const group = ref('G1')
    const open = ref(true)
    const choices = scope.run(() => useTokenBuckets(group, open))!
    await settle()
    open.value = false
    await settle()

    if (context === 'group') group.value = 'G2'
    else if (context === 'session') sessionEpoch.value += 1
    else apiBaseUrl.value = 'https://b.test/api/v1'
    await settle()

    expect(choices.buckets.value).toEqual([])
    expect(choices.state.value).toBe('idle')
    expect(listGroupDataPaths).toHaveBeenCalledTimes(1)
    open.value = true
    await settle()
    expect(listGroupDataPaths).toHaveBeenCalledTimes(2)
    expect(listGroupDataPaths.mock.calls[1][0]).toBe(group.value)
    expect(listGroupDataPaths.mock.calls[1][2].baseUrl).toBe(apiBaseUrl.value)
  })

  it('discards an unfinished listing after collapse', async () => {
    let answer: (value: unknown) => void = () => undefined
    listGroupDataPaths.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const open = ref(true)
    const choices = scope.run(() => useTokenBuckets(ref('G1'), open))!
    open.value = false
    await settle()
    answer({ entries: folders('held') })
    await settle()

    expect(choices.buckets.value).toEqual([])
    expect(getBucketEncryption).not.toHaveBeenCalled()
    open.value = true
    await settle()
    expect(choices.buckets.value).toEqual(['held', 'locked', 'foreign'])
  })

  it('tells a refused listing from a failed one', async () => {
    listGroupDataPaths.mockRejectedValueOnce(new Api.ApiError(403, 'forbidden'))
    const refused = scope.run(() => useTokenBuckets(ref('G1'), ref(true)))!
    listGroupDataPaths.mockRejectedValueOnce(new Error('offline'))
    const failed = scope.run(() => useTokenBuckets(ref('G1'), ref(true)))!
    await settle()

    expect(refused.state.value).toBe('refused')
    expect(failed.state.value).toBe('failed')
    expect(failed.error.value).toBe('offline')
    expect(failed.buckets.value).toEqual([])
  })
})
