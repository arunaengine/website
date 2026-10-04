// The whole browser unlock against fake nodes: the real vault, copy opening,
// unlock flow and bucket state, with the shared vectors as the node's data.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import copy from '@/lib/vault/__fixtures__/bucket-copy.json'
import { createVault, sealKeypair } from '@/lib/vault/crypto'

vi.mock('./s3/endpoints', () => ({
  localNodeId: () => 'node-a',
  nodeApiBase: (id: string) => (id === copy.node_id ? 'https://b.test/api/v1' : 'https://a.test/api/v1'),
}))

const KEY_ID = copy.key_id
const PASSPHRASE = 'correct horse battery'

function bytes(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

function base64(hex: string): string {
  return btoa(String.fromCharCode(...bytes(hex)))
}

/** A vault whose only keypair is the vector user key, retired as after a rotation elsewhere. */
async function retiredVault(): Promise<string> {
  const created = await createVault(PASSPHRASE, false, { iterations: 500 })
  const entry = await sealKeypair(created.masterKey, KEY_ID, bytes(copy.recipient_private), '2026-10-01T00:00:00Z')
  return JSON.stringify({ ...created.payload, keys: [{ ...entry, retired_at: '2026-10-02T00:00:00Z' }] })
}

/** Enough of IndexedDB for the vault key store; every value it is given is recorded. */
function fakeIndexedDb(writes: unknown[]) {
  const stores = new Map<string, Map<unknown, unknown>>()
  const answer = <T>(value: () => T) => {
    const request: { result?: T; onsuccess?: () => void; onerror?: () => void } = {}
    queueMicrotask(() => {
      request.result = value()
      request.onsuccess?.()
    })
    return request
  }
  const database = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => stores.set(name, new Map()),
    transaction: (name: string) => ({
      objectStore: () => {
        const store = stores.get(name)!
        return {
          get: (key: unknown) => answer(() => store.get(key)),
          put: (value: unknown, key: unknown) => {
            writes.push(value)
            return answer(() => store.set(key, value))
          },
          delete: (key: unknown) => answer(() => store.delete(key)),
          clear: () => answer(() => store.clear()),
        }
      },
    }),
    close() {},
  }
  return {
    open: () => {
      const request: { result?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void } = {}
      queueMicrotask(() => {
        request.result = database
        request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    },
  }
}

interface NodeCall {
  method: string
  url: URL
  key?: string
}

async function fakeNodes(options: { decrypting?: boolean } = {}) {
  const calls: NodeCall[] = []
  const stored: string[] = []
  const idbWrites: unknown[] = []
  const directory = [{ record_id: 'R1', key_id: KEY_ID, public_key: base64(copy.recipient_public), fingerprint: '', has_recovery: true, created_at: '' }]
  let heads = [{ revision: 'R0001', predecessors: [], payload: await retiredVault(), updated_at: '' }]
  let unlocked = false
  const unlockState = () =>
    unlocked
      ? { state: 'unlocked', lock_reason: null, locked_at_ms: null, session_id: 'S1', unlocked_at_ms: 2, deadline_ms: 3_600_002, max_deadline_ms: null }
      : { state: 'locked', lock_reason: 'restart', locked_at_ms: 1, session_id: null, unlocked_at_ms: null, deadline_ms: null, max_deadline_ms: null }
  const vectorKey = () => ({
    generation: copy.generation,
    role: options.decrypting ? 'source' : 'active',
    public_key: base64(copy.bucket_public),
    fingerprint: copy.bucket_fingerprint,
    unlock: unlockState(),
  })
  const status = () => ({
    bucket: 'reef',
    mode: options.decrypting ? 'off' : 'vault_locked',
    bucket_id: copy.bucket_id,
    storage_generation: 1,
    key_generation: options.decrypting ? copy.generation + 1 : copy.generation,
    public_key: options.decrypting ? null : base64(copy.bucket_public),
    fingerprint: options.decrypting ? null : copy.bucket_fingerprint,
    cipher: 'chacha20_poly1305',
    block_keys: 'content_derived',
    max_unlock_ms: null,
    unlock: options.decrypting ? null : unlockState(),
    generations: [vectorKey()],
    holders: { ready: 1, pending: 0, missing_key: 0 },
    recovery: { state: 'met', ready_holders: 1, ready_with_recovery: 1 },
    transition: null,
    caller: { holder: true, ready_copy: true, admin: false },
  })
  const sealedCopy = {
    bucket_id: copy.bucket_id,
    generation: copy.generation,
    key_record: copy.key_record,
    key_id: KEY_ID,
    enc: base64(copy.enc),
    ciphertext: base64(copy.ciphertext),
    created_at_ms: 1,
  }
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: (_: string, value: string) => stored.push(value) })
  vi.stubGlobal('indexedDB', fakeIndexedDb(idbWrites))
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const body = init.body instanceof Uint8Array ? Array.from(init.body, (b) => b.toString(16).padStart(2, '0')).join('') : undefined
    calls.push({ method, url, key: body })
    const path = url.pathname.replace('/api/v1', '')
    const json = (value: unknown) => new Response(JSON.stringify(value))
    if (path === '/access/users/me/vault' && method === 'GET') return json({ heads })
    if (path === '/access/users/me/vault' && method === 'PUT') {
      const request = JSON.parse(String(init.body))
      heads = [{ revision: 'R0002', predecessors: request.predecessors, payload: request.payload, updated_at: '' }]
      return json({ heads })
    }
    if (path.startsWith('/access/users/') && path.endsWith('/keys') && method === 'GET') return json({ keys: directory })
    if (path === '/access/users/me/keys') {
      const request = JSON.parse(String(init.body))
      directory.unshift({ ...request, record_id: 'R2', fingerprint: '', created_at: '' })
      return json(directory[0])
    }
    if (path.endsWith('/storage/encryption')) return json(status())
    if (path.endsWith('/storage/compression')) return json({ bucket: 'reef', mode: 'off' })
    if (path.endsWith('/copies/me')) return json({ copies: [sealedCopy] })
    if (path.endsWith('/unlock')) {
      unlocked = true
      return json(unlockState())
    }
    return new Response('{}', { status: 404 })
  }))
  return { calls, stored, idbWrites }
}

/** Nothing this browser keeps, in storage or IndexedDB, holds the bucket key in any encoding. */
function expectNoStoredKey(stored: string[], idbWrites: unknown[]) {
  expect(idbWrites.length).toBeGreaterThan(0)
  for (const value of [...stored, ...idbWrites]) {
    if (value instanceof CryptoKey) {
      expect(value.extractable).toBe(false)
      expect(value.algorithm.name).toBe('AES-GCM')
      continue
    }
    const text = JSON.stringify(value)
    expect(text).not.toContain(copy.bucket_private)
    expect(text).not.toContain(base64(copy.bucket_private))
  }
}

async function signIn() {
  vi.resetModules()
  const state = await import('./aruna/state')
  state.apiBaseUrl.value = 'https://a.test/api/v1'
  state.authToken.value = 'bearer-1'
  state.userInfo.value = { user: { user_id: copy.user_id }, realm: { realm_id: copy.realm_id } } as never
  const { useUserVault } = await import('./useUserVault')
  const { useBucketEncryption } = await import('./useBucketEncryption')
  return { state, vault: useUserVault(), useBucketEncryption }
}

let scope = effectScope()

afterEach(() => {
  scope.stop()
  scope = effectScope()
  vi.unstubAllGlobals()
})

describe('unlocking a vault-locked bucket from the browser', () => {
  it('opens the copy with a retired vault key and sends only that bucket key to its node', async () => {
    const { calls, stored, idbWrites } = await fakeNodes()
    const { vault: keys, useBucketEncryption } = await signIn()
    await keys.load()
    await keys.unlock(PASSPHRASE)
    const encryption = scope.run(() => useBucketEncryption(ref('reef'), ref(copy.node_id), ref('g-1')))!
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))

    const outcome = await encryption.unlock(copy.generation, 3_600_000)

    expect(outcome).toMatchObject({ kind: 'unlocked', ownKey: 'matches' })
    expect(encryption.status.value?.unlock?.state).toBe('unlocked')
    const unlock = calls.find((call) => call.url.pathname.endsWith('/unlock'))!
    expect(unlock.url.origin).toBe('https://b.test')
    expect(unlock.key).toBe(copy.bucket_private)
    expect(Object.fromEntries(unlock.url.searchParams)).toEqual({
      bucket_id: copy.bucket_id,
      generation: String(copy.generation),
      duration_ms: '3600000',
    })
    // The new vault key was published before the copy was fetched.
    const published = calls.findIndex((call) => call.url.pathname.endsWith('/users/me/keys'))
    const fetched = calls.findIndex((call) => call.url.pathname.endsWith('/copies/me'))
    expect(published).toBeGreaterThanOrEqual(0)
    expect(published).toBeLessThan(fetched)
    expectNoStoredKey(stored, idbWrites)
  })

  it('unlocks the previous key of a bucket whose stored versions are being decrypted', async () => {
    const { calls, stored, idbWrites } = await fakeNodes({ decrypting: true })
    const { vault: keys, useBucketEncryption } = await signIn()
    await keys.load()
    await keys.unlock(PASSPHRASE)
    const encryption = scope.run(() => useBucketEncryption(ref('reef'), ref(copy.node_id), ref('g-1')))!
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))

    const outcome = await encryption.unlock(copy.generation)

    expect(outcome).toMatchObject({ kind: 'unlocked' })
    const unlock = calls.find((call) => call.url.pathname.endsWith('/unlock'))!
    expect(unlock.key).toBe(copy.bucket_private)
    expect(unlock.url.searchParams.get('generation')).toBe(String(copy.generation))
    expect(encryption.status.value?.generations?.[0].unlock.state).toBe('unlocked')
    expectNoStoredKey(stored, idbWrites)
  })

  it('sends nothing for a bucket shown under another session', async () => {
    const { calls } = await fakeNodes()
    const { state, vault: keys, useBucketEncryption } = await signIn()
    await keys.load()
    await keys.unlock(PASSPHRASE)
    const encryption = scope.run(() => useBucketEncryption(ref('reef'), ref(copy.node_id), ref('g-1')))!
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))

    const pending = encryption.unlock(copy.generation)
    state.sessionEpoch.value += 1
    const outcome = await pending.catch((error: unknown) => error)

    expect(outcome === null || outcome instanceof Error).toBe(true)
    expect(calls.some((call) => call.url.pathname.endsWith('/unlock'))).toBe(false)
  })
})
