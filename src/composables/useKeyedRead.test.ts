import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POLL_MS, ReadEndedError, useKeyedRead } from './useKeyedRead'

const read = vi.hoisted(() => ({
  fetchEnvelope: vi.fn(),
  ownGrants: vi.fn(),
  requestKey: vi.fn(),
  readWithGrant: vi.fn(),
  usableGrant: vi.fn(),
}))
const vault = vi.hoisted(() => ({ state: { value: 'unlocked' }, loaded: { value: true }, load: vi.fn() }))

vi.mock('@/lib/vault/keyedRead', async (original) => ({ ...(await original<object>()), ...read }))
vi.mock('./useUserVault', () => ({ useUserVault: () => vault }))
vi.mock('./aruna/state', async () => {
  const { ref } = await import('vue')
  return { sessionEpoch: ref(0), userInfo: ref({ user: { user_id: 'U' } }) }
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
})
