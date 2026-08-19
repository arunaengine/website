import { nextTick, ref } from 'vue'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { S3SessionResponse } from '@/lib/api'

const authToken = ref('bearer-a')
const apiBaseUrl = ref('https://api.node-a.test/api/v1')
const currentUser = ref<{ id: string } | null>({ id: 'user-a' })
const nodeInfo = ref({
  node: { peer_id: 'node-a', realm_id: 'realm-a' },
  services: { interfaces: { s3: { url: 'https://s3.node-a.test' } } },
})
const realmInfo = ref({
  realm_id: 'realm-a',
  interfaces: { s3: { url: 'https://s3.node-a.test' } },
  nodes: [
    {
      node_id: 'node-b',
      info: { urls: { api: 'https://api.node-b.test', s3: 'https://s3.node-b.test' } },
    },
  ],
})
const apiRequest = vi.fn()

let sessionModule: typeof import('./useS3')
let s3: ReturnType<typeof import('./useS3').useS3>

function sessionResponse(
  overrides: Partial<S3SessionResponse> = {},
): S3SessionResponse {
  return {
    access_key_id: 'session-key-a',
    secret_access_key: 'secret-a',
    session_token: 'token-a',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    group: { id: 'group-a' },
    restrictions: [],
    issuer_node: { node_id: 'node-a', s3_endpoint: 'https://s3.node-a.test' },
    ...overrides,
  }
}

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

let startupLocal: MemoryStorage
let startupSession: MemoryStorage

beforeAll(async () => {
  startupLocal = new MemoryStorage()
  startupSession = new MemoryStorage()
  startupLocal.setItem('aruna.s3Key', 'legacy-local')
  startupSession.setItem('aruna.s3Key', 'legacy-session')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: startupLocal, sessionStorage: startupSession },
  })
  vi.doMock('./useAruna', () => ({
    useAruna: () => ({ nodeInfo, realmInfo, authToken, apiBaseUrl, currentUser }),
  }))
  vi.doMock('@/lib/api', () => ({ apiRequest }))
  sessionModule = await import('./useS3')
  s3 = sessionModule.useS3()
  Reflect.deleteProperty(globalThis, 'window')
})

beforeEach(async () => {
  vi.useRealTimers()
  authToken.value = 'bearer-a'
  apiBaseUrl.value = 'https://api.node-a.test/api/v1'
  currentUser.value = { id: 'user-a' }
  await nextTick()
  s3.clearSessions()
  apiRequest.mockReset().mockResolvedValue(sessionResponse())
})

afterEach(() => {
  s3.clearSessions()
  vi.useRealTimers()
  Reflect.deleteProperty(globalThis, 'window')
})

afterAll(() => {
  vi.doUnmock('./useAruna')
  vi.doUnmock('@/lib/api')
})

describe('portal S3 session migration and selection', () => {
  it('purges the legacy key from both browser storages without writing session material', async () => {
    expect(startupLocal.getItem('aruna.s3Key')).toBeNull()
    expect(startupSession.getItem('aruna.s3Key')).toBeNull()

    const local = new MemoryStorage()
    const session = new MemoryStorage()
    local.setItem('aruna.s3Key', 'legacy-local')
    session.setItem('aruna.s3Key', 'legacy-session')
    const localSet = vi.spyOn(local, 'setItem')
    const sessionSet = vi.spyOn(session, 'setItem')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: local, sessionStorage: session },
    })

    sessionModule.purgeLegacyS3KeyStorage()
    await s3.activateContext(null, 'group-a')

    expect(local.getItem('aruna.s3Key')).toBeNull()
    expect(session.getItem('aruna.s3Key')).toBeNull()
    expect(localSet).not.toHaveBeenCalled()
    expect(sessionSet).not.toHaveBeenCalled()
  })

  it('requires an explicit group before minting', async () => {
    await expect(s3.activateContext(null, '   ')).rejects.toThrow(
      'Select a group before opening S3 storage.',
    )
    expect(apiRequest).not.toHaveBeenCalled()
  })
})

describe('portal S3 session signing and refresh', () => {
  it('signs requests with the temporary session token', async () => {
    await s3.activateContext(null, 'group-a')

    const signed = new URL(await s3.downloadUrl('bucket-a', 'object.txt', null))

    expect(signed.searchParams.get('X-Amz-Security-Token')).toBe('token-a')
  })

  it('refreshes an actively used session at the jittered T-5 minute boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'))
    const minted = sessionResponse()
    const refreshed = sessionResponse({
      secret_access_key: 'secret-b',
      session_token: 'token-b',
      expires_at: new Date(Date.now() + 115 * 60 * 1000).toISOString(),
    })
    apiRequest.mockResolvedValueOnce(minted).mockResolvedValueOnce(refreshed)
    await s3.activateContext(null, 'group-a')
    await s3.downloadUrl('bucket-a', 'object.txt', null)
    const boundary =
      60 * 60 * 1000 -
      sessionModule.S3_SESSION_REFRESH_WINDOW_MS +
      sessionModule.s3SessionRefreshJitterMs(minted.access_key_id)

    await vi.advanceTimersByTimeAsync(boundary - 1)
    expect(apiRequest).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(apiRequest.mock.calls[1]?.[0]).toBe(
      '/users/s3-sessions/session-key-a/refresh',
    )
    expect(apiRequest.mock.calls[1]?.[1]).toEqual({ method: 'POST' })
    expect(s3.activeSession.value?.sessionToken).toBe('token-b')
  })

  it('surfaces a failed refresh, keeps the valid session, and blocks it at expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'))
    const minted = sessionResponse()
    apiRequest.mockResolvedValueOnce(minted).mockRejectedValueOnce(new Error('refresh unavailable'))
    await s3.activateContext(null, 'group-a')
    await s3.downloadUrl('bucket-a', 'object.txt', null)
    const boundary =
      60 * 60 * 1000 -
      sessionModule.S3_SESSION_REFRESH_WINDOW_MS +
      sessionModule.s3SessionRefreshJitterMs(minted.access_key_id)

    await vi.advanceTimersByTimeAsync(boundary)

    expect(s3.activeSession.value).toMatchObject({
      state: 'warning',
      warning: expect.stringContaining('refresh unavailable'),
    })
    expect(s3.hasActiveKey.value).toBe(true)
    expect(apiRequest).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 - boundary)
    expect(s3.activeSession.value?.state).toBe('expired')
    expect(s3.hasActiveKey.value).toBe(false)
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })
})

describe('portal S3 session boundaries and node scope', () => {
  it('keeps sessions for a same-user token refresh and clears them for user or API changes', async () => {
    await s3.activateContext(null, 'group-a')

    authToken.value = 'bearer-a-refreshed'
    currentUser.value = null
    await nextTick()
    expect(s3.sessions.value.size).toBe(1)
    currentUser.value = { id: 'user-a' }
    await nextTick()
    expect(s3.sessions.value.size).toBe(1)

    currentUser.value = { id: 'user-b' }
    await nextTick()
    expect(s3.sessions.value.size).toBe(0)

    apiRequest.mockResolvedValueOnce(sessionResponse())
    await s3.activateContext(null, 'group-a')
    expect(s3.sessions.value.size).toBe(1)
    apiBaseUrl.value = 'https://api.other.test/api/v1'
    await nextTick()
    expect(s3.sessions.value.size).toBe(0)
  })

  it('rejects a wrong-node operation before constructing a request', async () => {
    await s3.activateContext(null, 'group-a')

    expect(s3.contextMismatch('node-b')).toEqual({
      issuerNodeId: 'node-a',
      requiredNodeId: 'node-b',
    })
    await expect(s3.downloadUrl('bucket-a', 'object.txt', 'node-b')).rejects.toMatchObject({
      name: 'S3ContextMismatchError',
      issuerNodeId: 'node-a',
      requiredNodeId: 'node-b',
    })
  })

  it('keeps independent node and group sessions in memory', async () => {
    apiRequest
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        sessionResponse({
          access_key_id: 'session-key-b',
          secret_access_key: 'secret-b',
          session_token: 'token-b',
          group: { id: 'group-b' },
          issuer_node: { node_id: 'node-b', s3_endpoint: 'https://s3.node-b.test' },
        }),
      )

    await s3.activateContext(null, 'group-a')
    await s3.activateContext('node-b', 'group-b')

    expect(s3.sessions.value.size).toBe(2)
    expect(s3.activeContext.value).toMatchObject({ nodeId: 'node-b', groupId: 'group-b' })
    expect(s3.referenceForContext(null, 'group-a')).toEqual({
      nodeId: 'node-a',
      groupId: 'group-a',
      accessKeyId: 'session-key-a',
    })
    expect(apiRequest.mock.calls[1]?.[2]).toMatchObject({
      baseUrl: 'https://api.node-b.test/api/v1',
    })

    await s3.activateContext(null, 'group-a')
    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(s3.activeContext.value).toMatchObject({ nodeId: 'node-a', groupId: 'group-a' })
  })
})

describe('session restrictions', () => {
  it('allows read-only paths while denying write and lets deny override write', () => {
    const path = '/realm-a/g/group-a/data/node-a/bucket-a/folder/object.txt'

    expect(
      sessionModule.s3RestrictionsAllowPath(
        [{ pattern: '/realm-a/g/group-a/data/node-a/bucket-a/**', permission: 'read' }],
        path,
        'read',
      ),
    ).toBe(true)
    expect(
      sessionModule.s3RestrictionsAllowPath(
        [{ pattern: '/realm-a/g/group-a/data/node-a/bucket-a/**', permission: 'read' }],
        path,
        'write',
      ),
    ).toBe(false)
    expect(
      sessionModule.s3RestrictionsAllowPath(
        [
          { pattern: '/realm-a/g/group-a/data/node-a/bucket-a/**', permission: 'write' },
          { pattern: path, permission: 'deny' },
        ],
        path,
        'write',
      ),
    ).toBe(false)
  })

  it('gates active-context write and recursive delete capabilities', async () => {
    const bucketRoot = '/realm-a/g/group-a/data/node-a/bucket-a'
    apiRequest.mockResolvedValueOnce(
      sessionResponse({ restrictions: [{ pattern: `${bucketRoot}/**`, permission: 'read' }] }),
    )
    await s3.activateContext(null, 'group-a')

    expect(s3.canRead('bucket-a', 'object.txt', null)).toBe(true)
    expect(s3.canWrite('bucket-a', 'object.txt', null)).toBe(false)
    expect(s3.canWritePrefix('bucket-a', '', null)).toBe(false)
    expect(s3.canDeletePrefix('bucket-a', '', null)).toBe(false)

    s3.clearSessions()
    apiRequest.mockResolvedValueOnce(
      sessionResponse({
        restrictions: [
          { pattern: `${bucketRoot}/**`, permission: 'write' },
          { pattern: `${bucketRoot}/protected/**`, permission: 'deny' },
        ],
      }),
    )
    await s3.activateContext(null, 'group-a')

    expect(s3.canWrite('bucket-a', 'ordinary.txt', null)).toBe(true)
    expect(s3.canDeletePrefix('bucket-a', '', null)).toBe(false)
  })
})

describe('ordinary operation errors', () => {
  it('presents a fenced purge as a retryable location message', () => {
    expect(
      sessionModule.s3ErrorMessage({
        name: 'PurgeInProgress',
        message: 'backend detail',
        $metadata: { httpStatusCode: 503 },
      }),
    ).toBe('A purge is running for this location; retry when it completes.')
    expect(
      sessionModule.isS3PurgeInProgressError({
        name: 'S3ServiceException',
        Code: 'PurgeInProgress',
        statusCode: 503,
      }),
    ).toBe(true)
    expect(
      sessionModule.isS3PurgeInProgressError({
        name: 'PurgeInProgress',
        $metadata: { httpStatusCode: 409 },
      }),
    ).toBe(false)
  })
})
