import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assistantChatScopeKey } from '@/lib/assistant/chatHistory'
import { sessionEpoch } from './aruna/state'
import { useKeyIssue } from './useKeyIssue'

const issueBucket = vi.hoisted(() => vi.fn())
const listGroupDataPaths = vi.hoisted(() => vi.fn())
const apiRequest = vi.hoisted(() => vi.fn())
const vault = vi.hoisted(() => ({ state: { value: 'unlocked' }, whileUnlocked: () => () => true }))
const notifications = vi.hoisted(() => ({
  items: { value: [] as Record<string, unknown>[] },
  listLoaded: { value: false },
  unreadCount: { value: 0 },
  dashboardRevision: { value: 0 },
  nextCursor: { value: null as string | null },
  loadNotifications: vi.fn(),
  loadMore: vi.fn(),
  markRead: vi.fn(),
}))

vi.mock('@/lib/vault/keyIssue', () => ({ issueBucket }))
vi.mock('@/lib/api', () => ({ apiRequest, listGroupDataPaths }))
vi.mock('./useUserVault', () => ({ useUserVault: () => vault }))
vi.mock('./useNotifications', () => ({ useNotifications: () => notifications }))
vi.mock('./s3/endpoints', () => ({ localNodeId: () => 'n0', nodeApiBase: (node: string) => `https://${node}.test/api/v1` }))
vi.mock('./aruna/state', async () => {
  const { ref } = await import('vue')
  return {
    apiBaseUrl: ref('https://api.test'),
    authToken: ref('T'),
    realmInfo: ref(null),
    sessionEpoch: ref(0),
    userInfo: ref({ user: { user_id: 'H' }, realm: { realm_id: 'R' } }),
  }
})

const KEY = `aruna.keyIssue.waiting:${assistantChatScopeKey({ apiBaseUrl: 'https://api.test', realmId: 'R', userId: 'H' })}`
const store = new Map<string, string>()

function stored() {
  return JSON.parse(store.get(KEY) ?? '[]') as { bucket: string; nodeId: string }[]
}

function notice(id: string, bucket: string, read: boolean) {
  return { id, kind: 'bucket_key_pending', bucket, node_id: 'n1', read }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  })
  vault.state = ref('unlocked')
  notifications.items = ref([])
  notifications.listLoaded = ref(true)
  notifications.unreadCount = ref(0)
  notifications.dashboardRevision = ref(0)
  notifications.nextCursor = ref(null)
  issueBucket.mockResolvedValue({ users: new Set(['ada']), done: true })
  apiRequest.mockResolvedValue({ notifications: [] })
})

describe('key issuance recovery', () => {
  it('issues a bucket kept from an earlier page load and forgets it once done', async () => {
    store.set(KEY, JSON.stringify([{ bucket: 'reef', nodeId: 'n1' }]))

    await useKeyIssue().issueWaiting()

    expect(issueBucket.mock.calls[0]![0]).toMatchObject({ bucket: 'reef', nodeId: 'n1', client: { token: 'T' } })
    expect(store.has(KEY)).toBe(false)
  })

  it('keeps buckets whose issuance failed or stayed incomplete', async () => {
    store.set(KEY, JSON.stringify([{ bucket: 'reef', nodeId: 'n1' }, { bucket: 'kelp', nodeId: 'n1' }]))
    issueBucket.mockResolvedValueOnce({ users: new Set(), done: false }).mockRejectedValueOnce(new Error('503'))

    await useKeyIssue().issueWaiting()

    expect(stored()).toEqual([{ bucket: 'reef', nodeId: 'n1' }, { bucket: 'kelp', nodeId: 'n1' }])
  })

  it('keeps the buckets of a role grant made while the vault is closed, with no secrets', async () => {
    vault.state.value = 'locked'
    listGroupDataPaths.mockResolvedValueOnce({ entries: [{ permission_path: '/R/g/G/data/n1/reef' }] })

    await useKeyIssue().issueAfterGrant('G', ['Q1'])

    expect(issueBucket).not.toHaveBeenCalled()
    expect(store.get(KEY)).toBe(JSON.stringify([{ bucket: 'reef', nodeId: 'n1' }]))
  })

  it('keeps the buckets of a closed-vault role grant in the page when storage fails', async () => {
    const fail = () => {
      throw new Error('storage unavailable')
    }
    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail })
    vault.state.value = 'locked'
    listGroupDataPaths.mockResolvedValueOnce({ entries: [{ permission_path: '/R/g/G/data/n1/reef' }] })
    await useKeyIssue().issueAfterGrant('G', ['Q1'])

    vault.state.value = 'unlocked'
    await useKeyIssue().issueWaiting()
    await useKeyIssue().issueWaiting()

    expect(issueBucket).toHaveBeenCalledTimes(1)
    expect(issueBucket.mock.calls[0]![0]).toMatchObject({ bucket: 'reef', nodeId: 'n1' })
  })

  it('issues known buckets first, then those of every notice page, read ones too', async () => {
    store.set(KEY, JSON.stringify([{ bucket: 'wave', nodeId: 'n1' }]))
    notifications.items.value = [notice('N2', 'kelp', false), notice('N3', 'coral', false)]
    apiRequest
      .mockResolvedValueOnce({
        notifications: [notice('N1', 'reef', true), { id: 'X', kind: 'other' }, notice('N2', 'kelp', false)],
        next_cursor: 'next',
      })
      .mockResolvedValueOnce({ notifications: [notice('N3', 'coral', false), notice('N4', 'reef', false)] })
    issueBucket.mockImplementation(async (target: { bucket: string }) =>
      ({ users: new Set(), done: target.bucket !== 'kelp' }))

    await useKeyIssue().issueWaiting([], true)

    expect(issueBucket.mock.calls.map((call) => call[0].bucket)).toEqual(['wave', 'reef', 'kelp', 'coral'])
    expect(issueBucket.mock.invocationCallOrder[0]).toBeLessThan(apiRequest.mock.invocationCallOrder[0]!)
    expect(apiRequest.mock.calls[1]![1]).toEqual({ query: { limit: 200, cursor: 'next' } })
    expect(notifications.loadMore).not.toHaveBeenCalled()
    expect(notifications.markRead).toHaveBeenLastCalledWith(['N4', 'N3'])
    expect(stored()).toEqual([{ bucket: 'kelp', nodeId: 'n1' }])
  })

  it('marks notices read by id while the inbox refresh is still running', async () => {
    notifications.items.value = []
    apiRequest.mockResolvedValueOnce({ notifications: [notice('N1', 'reef', false)] })

    await useKeyIssue().issueWaiting()

    expect(notifications.loadNotifications).not.toHaveBeenCalled()
    expect(notifications.markRead).toHaveBeenCalledWith(['N1'])
  })
})

describe('key issuance lifecycle', () => {
  async function settle() {
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
    await nextTick()
  }

  it('installs the vault watcher again when the notice mounts again', async () => {
    store.set(KEY, JSON.stringify([{ bucket: 'reef', nodeId: 'n1' }]))
    issueBucket.mockResolvedValue({ users: new Set(), done: false })
    vault.state.value = 'locked'
    const first = effectScope()
    first.run(() => useKeyIssue().watchVault())
    first.stop()

    vault.state.value = 'unlocked'
    const second = effectScope()
    second.run(() => useKeyIssue().watchVault())
    await settle()
    expect(issueBucket).toHaveBeenCalledTimes(1)

    vault.state.value = 'locked'
    await settle()
    vault.state.value = 'unlocked'
    await settle()
    expect(issueBucket).toHaveBeenCalledTimes(2)
    second.stop()
  })

  it('settles a key notice that arrives after its bucket was issued', async () => {
    const scope = effectScope()
    scope.run(() => useKeyIssue().watchVault())
    await settle()

    apiRequest.mockResolvedValue({ notifications: [notice('N1', 'reef', false)] })
    notifications.dashboardRevision.value += 1
    await vi.waitFor(() => expect(notifications.markRead).toHaveBeenCalledWith(['N1']))
    expect(issueBucket.mock.calls[0]![0]).toMatchObject({ bucket: 'reef', nodeId: 'n1' })
    scope.stop()
  })

  it('does not repeat a pass when marking a notice read fails and restores the count', async () => {
    const scope = effectScope()
    scope.run(() => useKeyIssue().watchVault())
    await settle()
    apiRequest.mockResolvedValue({ notifications: [notice('N1', 'reef', false)] })
    notifications.markRead.mockImplementation(async () => {
      notifications.unreadCount.value -= 1
      await nextTick()
      notifications.unreadCount.value += 1
    })
    notifications.unreadCount.value = 1
    notifications.dashboardRevision.value += 1
    await vi.waitFor(() => expect(notifications.markRead).toHaveBeenCalledTimes(1))
    await settle()
    await settle()

    expect(issueBucket).toHaveBeenCalledTimes(1)
    notifications.markRead.mockReset()
    scope.stop()
  })

  it('settles a key notice that arrives while the unread count is capped', async () => {
    notifications.unreadCount.value = 100
    const scope = effectScope()
    scope.run(() => useKeyIssue().watchVault())
    await settle()

    apiRequest.mockResolvedValue({ notifications: [notice('N1', 'reef', false)] })
    notifications.dashboardRevision.value += 1
    await vi.waitFor(() => expect(notifications.markRead).toHaveBeenCalledWith(['N1']))
    scope.stop()
  })

  it('checks read key notices at vault opening only', async () => {
    apiRequest.mockResolvedValue({ notifications: [notice('N1', 'reef', true)] })
    const scope = effectScope()
    scope.run(() => useKeyIssue().watchVault())
    await vi.waitFor(() => expect(issueBucket).toHaveBeenCalledTimes(1))

    notifications.dashboardRevision.value += 1
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))
    await settle()

    expect(issueBucket).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('drops work queued under a session that ended before it ran', async () => {
    let release = () => {}
    issueBucket.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ users: new Set(), done: true })
    }))
    const keyIssue = useKeyIssue()
    const target = keyIssue.targetOf('reef', 'n1')!
    const first = keyIssue.issueWaiting([target])
    await settle()
    const queued = keyIssue.issueWaiting([keyIssue.targetOf('kelp', 'n1')!])
    await settle()

    sessionEpoch.value += 1
    release()
    await Promise.all([first, queued])

    expect(issueBucket).toHaveBeenCalledTimes(1)
  })

  it('changes no notice or count when the session ends before issuance returns', async () => {
    notifications.items.value = [notice('N1', 'reef', false)]
    let release = () => {}
    issueBucket.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ users: new Set(['ada']), done: true })
    }))
    const keyIssue = useKeyIssue()
    keyIssue.issued.value = null
    const running = keyIssue.issueWaiting([keyIssue.targetOf('reef', 'n1')!])
    await settle()
    expect(issueBucket).toHaveBeenCalledTimes(1)

    sessionEpoch.value += 1
    await nextTick()
    release()

    expect(await running).toBeUndefined()
    expect(notifications.markRead).not.toHaveBeenCalled()
    expect(keyIssue.issued.value).toBeNull()
  })
})
