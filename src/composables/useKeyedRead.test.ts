import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { sessionEpoch } from './aruna/state'
import { POLL_MS, ReadEndedError, useKeyedRead } from './useKeyedRead'

const read = vi.hoisted(() => ({
  fetchEnvelope: vi.fn(),
  ownGrants: vi.fn(),
  requestKey: vi.fn(),
  readWithGrant: vi.fn(),
  usableGrant: vi.fn(),
}))
const vault = vi.hoisted(() => ({
  state: { value: 'unlocked' },
  loaded: { value: true },
  load: vi.fn(),
  whileUnlocked: () => () => true,
  checkKey: vi.fn(),
  recoveryCode: { value: null as string | null },
}))
const closeKeyWorker = vi.hoisted(() => vi.fn())

vi.mock('@/lib/vault/keyedRead', async (original) => ({ ...(await original<object>()), ...read }))
vi.mock('@/lib/vault/keyWorker', async (original) => ({ ...(await original<object>()), closeKeyWorker }))
vi.mock('./useUserVault', () => ({ useUserVault: () => vault }))
vi.mock('./s3/endpoints', () => ({ localNodeId: () => 'n', nodeApiBase: () => 'https://node.test/api/v1' }))
const headObject = vi.hoisted(() => vi.fn())
vi.mock('./useS3', () => ({ useS3: () => ({ headObject }) }))
vi.mock('./aruna/state', async () => {
  const { ref } = await import('vue')
  return { sessionEpoch: ref(0), userInfo: ref({ user: { user_id: 'U' } }), authToken: ref('T1') }
})

const TARGET = { bucket: 'reef', key: 'raw/a.csv', versionId: 'V1', client: {} }
const GRANT = { fields: {} }

async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  read.fetchEnvelope.mockResolvedValue({})
  read.usableGrant.mockImplementation((grants: unknown[]) => grants[0] ?? null)
  read.readWithGrant.mockResolvedValue(new Blob(['ok']))
  const state = ref('unlocked')
  vault.state = state
  vault.recoveryCode = ref(null)
})

afterEach(() => vi.useRealTimers())

describe('keyed read waits', () => {
  it('waits for a key, polls the grants and resumes when one arrives', async () => {
    read.ownGrants.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([GRANT])
    read.requestKey.mockResolvedValueOnce(null)
    const keyed = useKeyedRead()
    const done = keyed.read(TARGET)
    await settle()
    expect(keyed.wait.value).toBe('pending')
    expect(keyed.pending.value.has('reef\u0000raw/a.csv')).toBe(true)

    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(keyed.wait.value).toBe('pending')
    await vi.advanceTimersByTimeAsync(POLL_MS)

    expect(await (await done).text()).toBe('ok')
    expect(read.ownGrants).toHaveBeenCalledTimes(3)
    expect(keyed.pending.value.size).toBe(0)
    expect(keyed.wait.value).toBeNull()
  })

  it('repeats the request at each interval and keeps waiting through a network failure', async () => {
    read.ownGrants
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    read.requestKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new ApiError(503, 'unavailable'))
      .mockResolvedValueOnce(GRANT)
    const keyed = useKeyedRead()
    const done = keyed.read(TARGET)
    await settle()

    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(keyed.wait.value).toBe('pending')
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(keyed.wait.value).toBe('pending')
    expect(keyed.pending.value.size).toBe(1)
    read.ownGrants.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(POLL_MS)

    expect(await (await done).text()).toBe('ok')
    expect(read.requestKey).toHaveBeenCalledTimes(4)
  })

  it('ends the wait with the error once the request is refused', async () => {
    read.ownGrants.mockResolvedValue([])
    read.requestKey.mockResolvedValueOnce(null).mockRejectedValueOnce(new ApiError(403, 'no access'))
    const keyed = useKeyedRead()
    const done = keyed.read(TARGET)
    const failed = expect(done).rejects.toMatchObject({ status: 403 })
    await settle()

    await vi.advanceTimersByTimeAsync(POLL_MS)

    await failed
    expect(keyed.wait.value).toBeNull()
    expect(keyed.pending.value.size).toBe(0)
  })

  it('asks a member without a vault to set one up, then requests the key', async () => {
    read.ownGrants.mockResolvedValueOnce([])
    read.requestKey.mockResolvedValueOnce(GRANT)
    vault.state.value = 'absent'
    const keyed = useKeyedRead()
    const done = keyed.read(TARGET)
    await settle()
    expect(keyed.wait.value).toBe('setup')
    expect(read.requestKey).not.toHaveBeenCalled()

    vault.recoveryCode.value = 'code'
    vault.state.value = 'unlocked'
    await settle()
    expect(keyed.wait.value).toBe('setup')

    vault.recoveryCode.value = null
    expect(await (await done).text()).toBe('ok')
    expect(vault.checkKey).toHaveBeenCalledTimes(1)
    expect(read.requestKey).toHaveBeenCalledTimes(1)
  })

  it('asks for the vault and resumes once it opens', async () => {
    read.ownGrants.mockResolvedValueOnce([GRANT])
    vault.state.value = 'locked'
    const keyed = useKeyedRead()
    const done = keyed.read(TARGET)
    await settle()
    expect(keyed.wait.value).toBe('vault')
    expect(read.readWithGrant).not.toHaveBeenCalled()

    vault.state.value = 'unlocked'
    await settle()

    expect(await (await done).text()).toBe('ok')
    expect(keyed.wait.value).toBeNull()
  })

  it('ends a waiting read on cancel without reading', async () => {
    read.ownGrants.mockResolvedValueOnce([GRANT])
    vault.state.value = 'locked'
    const keyed = useKeyedRead()
    const done = keyed.read(TARGET)
    await settle()

    keyed.cancel()

    await expect(done).rejects.toBeInstanceOf(ReadEndedError)
    expect(keyed.wait.value).toBeNull()
    expect(read.readWithGrant).not.toHaveBeenCalled()
  })

  it('ends a waiting read and its pending mark when its view goes away', async () => {
    read.ownGrants.mockResolvedValue([])
    read.requestKey.mockResolvedValue(null)
    const scope = effectScope()
    const keyed = scope.run(() => useKeyedRead())!
    const done = keyed.read(TARGET)
    await settle()
    expect(keyed.pending.value.size).toBe(1)

    scope.stop()

    await expect(done).rejects.toBeInstanceOf(ReadEndedError)
    expect(keyed.pending.value.size).toBe(0)
    expect(keyed.wait.value).toBeNull()
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)
    expect(read.ownGrants).toHaveBeenCalledTimes(1)
  })

  it('closes the key worker and aborts the download on cancel while opening the key', async () => {
    read.ownGrants.mockResolvedValueOnce([GRANT])
    let signal: AbortSignal | undefined
    read.readWithGrant.mockImplementationOnce((...args: unknown[]) => {
      signal = args[6] as AbortSignal
      return new Promise(() => {})
    })
    const keyed = useKeyedRead()
    const done = keyed.read(TARGET)
    await settle()

    keyed.cancel()

    await expect(Promise.race([done, Promise.resolve('open')])).resolves.toBe('open')
    expect(closeKeyWorker).toHaveBeenCalledTimes(1)
    expect(signal?.aborted).toBe(true)
  })
})

describe('version lookup', () => {
  function heads() {
    const answers: ((value: { versionId: string }) => void)[] = []
    headObject.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    return answers
  }

  it('lets a late lookup of a first click neither read nor end the second click', async () => {
    const answers = heads()
    read.ownGrants.mockResolvedValue([GRANT])
    const keyed = useKeyedRead()
    const first = keyed.readObject({ bucket: 'reef', key: 'a.csv' })
    const second = keyed.readObject({ bucket: 'reef', key: 'b.csv' })
    answers[1]!({ versionId: 'V2' })
    expect(await (await second).text()).toBe('ok')

    answers[0]!({ versionId: 'V1' })

    await expect(first).rejects.toBeInstanceOf(ReadEndedError)
    expect(read.fetchEnvelope).toHaveBeenCalledTimes(1)
    expect(read.fetchEnvelope.mock.calls[0]![0]).toMatchObject({ key: 'b.csv', versionId: 'V2' })
  })

  it('ends a read whose lookup outlived a cancel or a session change', async () => {
    const answers = heads()
    const keyed = useKeyedRead()
    const cancelled = keyed.readObject({ bucket: 'reef', key: 'a.csv' })
    keyed.cancel()
    answers[0]!({ versionId: 'V1' })
    await expect(cancelled).rejects.toBeInstanceOf(ReadEndedError)

    const switched = keyed.readObject({ bucket: 'reef', key: 'a.csv' })
    sessionEpoch.value += 1
    answers[1]!({ versionId: 'V1' })
    await expect(switched).rejects.toBeInstanceOf(ReadEndedError)
    expect(read.fetchEnvelope).not.toHaveBeenCalled()
  })
})
