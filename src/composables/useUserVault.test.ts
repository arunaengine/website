import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateBrowserProvider } from '@/lib/assistant/browserProviders'
import { assistantChatScopeKey } from '@/lib/assistant/chatHistory'
import * as Crypto from '@/lib/vault/crypto'

// A stand-in for the vault holders: each save is a head that replaces its
// predecessors, so two saves from the same state stay as two heads. Every
// restart below re-imports the modules, so the fakes tell the status apart by
// a field rather than by a class that would differ per import.
interface FakeHead {
  revision: string
  predecessors: string[]
  payload: string
  updated_at: string
}
const node = { heads: [] as FakeHead[], count: 0, unsupported: false }
function refused(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}
function status(error: unknown): number {
  return (error as { status?: number })?.status ?? 0
}
const readVault = vi.fn(async () => {
  if (node.unsupported) throw refused(404, 'no such route')
  return { heads: [...node.heads] }
})
const saveVault = vi.fn(async (request: { payload: string; predecessors: string[] }) => {
  node.count += 1
  const head = {
    revision: `R${String(node.count).padStart(4, '0')}`,
    predecessors: request.predecessors,
    payload: request.payload,
    updated_at: '2026-10-01T00:00:00Z',
  }
  node.heads = [...node.heads.filter((known) => !request.predecessors.includes(known.revision)), head]
  return { heads: [...node.heads] }
})
const deleteVault = vi.fn(async () => {
  node.heads = []
})
// The key directory, newest record first.
const directory: { key_id: string; public_key: string; has_recovery: boolean }[] = []
const listUserKeys = vi.fn(async (userId: string) => {
  if (userId !== 'u-1') throw refused(400, 'wrong user')
  return { keys: [...directory] }
})
const publishUserKey = vi.fn(async (request: { key_id: string; public_key: string; has_recovery: boolean }) => {
  directory.unshift(request)
  return request
})

// The remembered key and the cached heads, as the browser's IndexedDB would keep them.
const remembered = new Map<string, CryptoKey>()
const cached = new Map<string, FakeHead[]>()
const SCOPE = assistantChatScopeKey({ apiBaseUrl: 'https://node.test/api/v1', realmId: 'r-1', userId: 'u-1' })
const stored = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (name: string) => stored.get(name) ?? null,
  setItem: (name: string, value: string) => stored.set(name, value),
})

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  apiRequest: async () => {
    throw new Error('No other request belongs in this test.')
  },
  defaultApiBaseUrl: () => '/api/v1',
  readVault,
  saveVault,
  deleteVault,
  listUserKeys,
  publishUserKey,
  vaultConflicted: (error: unknown) => status(error) === 409,
  vaultUnavailable: (error: unknown) => status(error) === 503,
  vaultUnsupported: (error: unknown) => status(error) === 404 || status(error) === 405,
  apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock('@/lib/vault/keyStore', () => ({
  browserKeyStore: () => ({
    load: async (scope: string) => remembered.get(scope) ?? null,
    save: async (scope: string, key: CryptoKey) => {
      remembered.set(scope, key)
    },
    remove: async (scope: string) => {
      remembered.delete(scope)
    },
    loadHeads: async (scope: string) => cached.get(scope) ?? null,
    saveHeads: async (scope: string, heads: FakeHead[]) => {
      if (heads.length) cached.set(scope, heads)
      else cached.delete(scope)
    },
    clear: async () => {
      remembered.clear()
      cached.clear()
    },
  }),
}))
vi.mock('@/lib/vault/crypto', async (importOriginal) => {
  const original = await importOriginal<typeof Crypto>()
  return {
    ...original,
    createVault: (passphrase: string, withRecovery: boolean) =>
      original.createVault(passphrase, withRecovery, { iterations: 500 }),
  }
})

const work = validateBrowserProvider({ id: 'p-1', kind: 'anthropic', label: 'Work', model: 'claude', apiKey: 'sk-1' })
const local = validateBrowserProvider({
  id: 'p-2',
  kind: 'openai_compatible',
  label: 'Local',
  model: 'llama',
  baseUrl: 'http://localhost:11434/v1',
  protocol: 'chat_completions',
})

/** A fresh portal start: new module state against the same node and browser store. */
async function boot(options: { load?: boolean } = {}) {
  vi.resetModules()
  const state = await import('@/composables/aruna/state')
  state.apiBaseUrl.value = 'https://node.test/api/v1'
  state.authToken.value = 'token'
  state.userInfo.value = { user: { user_id: 'u-1' }, realm: { realm_id: 'r-1' } } as never
  const { useUserVault } = await import('./useUserVault')
  const vault = useUserVault()
  if (options.load !== false) await vault.load()
  return { vault, state }
}

/** What the node holds, opened the way another browser would open it. */
async function nodeProviders(passphrase: string) {
  expect(node.heads).toHaveLength(1)
  const payload = Crypto.parseVaultPayload(node.heads[0].payload)
  const key = await Crypto.unlockVault(payload, passphrase)
  return (await Crypto.openData(key, payload)).providers
}

beforeEach(() => {
  node.heads = []
  node.count = 0
  node.unsupported = false
  remembered.clear()
  cached.clear()
  stored.clear()
  directory.length = 0
  listUserKeys.mockClear()
  publishUserKey.mockClear()
  readVault.mockClear()
  saveVault.mockClear()
  deleteVault.mockClear()
})

describe('useUserVault', () => {
  it('creates the keys and opens them again on the next start', async () => {
    const { vault } = await boot()
    expect(vault.state.value).toBe('absent')

    const code = await vault.create('correct horse', true)

    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(vault.state.value).toBe('unlocked')
    expect(saveVault.mock.calls[0][0].predecessors).toEqual([])
    expect(remembered.size).toBe(1)
    expect([...remembered.values()][0].extractable).toBe(false)

    const restarted = await boot()
    expect(restarted.vault.state.value).toBe('unlocked')
    expect(restarted.vault.providers.value).toEqual([])
  })

  it('lock forgets the remembered key until the passphrase is entered again', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])

    vault.lock()

    expect(vault.state.value).toBe('locked')
    expect(vault.providers.value).toEqual([])
    expect(remembered.size).toBe(0)

    const restarted = await boot()
    expect(restarted.vault.state.value).toBe('locked')
    await expect(restarted.vault.unlock('wrong horse')).rejects.toThrow('Wrong passphrase.')
    expect(restarted.vault.state.value).toBe('locked')
    await restarted.vault.unlock('correct horse')
    expect(restarted.vault.state.value).toBe('unlocked')
    expect(restarted.vault.providers.value).toEqual([work])
    expect(remembered.size).toBe(1)
  })

  it('merges two heads on load and saves over both', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    const first = node.heads[0]
    // Another browser saves from the same state, so the holders keep two heads.
    const other = await boot()
    await other.vault.saveProviders([local])
    node.heads = [first, ...node.heads]

    const restarted = await boot()

    expect(saveVault.mock.calls.at(-1)?.[0].predecessors).toEqual(['R0002', 'R0001'])
    expect(restarted.vault.providers.value).toEqual([local])
    expect(await nodeProviders('correct horse')).toEqual([local])
  })

  it('merges the heads a save answers with', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])
    // Another browser adds a provider from the same state.
    const other = await boot()
    await other.vault.saveProviders([...other.vault.providers.value, local])
    const edited = { ...work, label: 'Work (edited)' }

    await vault.saveProviders([edited])

    expect(saveVault.mock.calls.at(-1)?.[0].predecessors).toEqual(['R0004', 'R0003'])
    expect(vault.providers.value).toEqual([edited, local])
    expect(await nodeProviders('correct horse')).toEqual([edited, local])
  })

  it('merges the heads on unlock with the passphrase', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    vault.lock()
    node.heads.push({ ...node.heads[0], revision: 'R0009' })

    const restarted = await boot()
    expect(restarted.vault.state.value).toBe('locked')
    expect(saveVault).toHaveBeenCalledTimes(1)
    await restarted.vault.unlock('correct horse')

    expect(saveVault.mock.calls.at(-1)?.[0].predecessors).toEqual(['R0009', 'R0001'])
    expect(node.heads).toHaveLength(1)
  })

  it('keeps a head another master key sealed out of the merge', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)

    // The other browser reset the keys and set them up again with a new master key,
    // while this one still saved on the old vault.
    const other = await boot()
    await other.vault.reset()
    await other.vault.create('new horse battery', false)
    await vault.saveProviders([work])

    expect(node.heads).toHaveLength(2)
    expect(vault.providers.value).toEqual([work])
    const again = await boot()
    again.vault.lock()
    await again.vault.unlock('new horse battery')
    expect(again.vault.providers.value).toEqual([])
    expect(node.heads).toHaveLength(2)
  })

  it('retries once on a lost concurrent write', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    saveVault.mockRejectedValueOnce(refused(409, 'retry'))

    await vault.saveProviders([work])

    expect(await nodeProviders('correct horse')).toEqual([work])
    expect(readVault).toHaveBeenCalledTimes(2)
  })

  it('opens the keys with the recovery code and sets a new passphrase from it', async () => {
    const { vault } = await boot()
    const code = await vault.create('forgotten passphrase', true)
    await vault.saveProviders([work])
    vault.lock()

    await expect(vault.unlockWithRecovery('nope')).rejects.toThrow('The recovery code is wrong.')
    await vault.unlockWithRecovery(code ?? '')
    expect(vault.providers.value).toEqual([work])

    await vault.changePassphrase({ recoveryCode: code ?? '' }, 'remembered passphrase')
    vault.lock()
    await vault.unlock('remembered passphrase')
    expect(vault.state.value).toBe('unlocked')
    expect(await nodeProviders('remembered passphrase')).toEqual([work])
  })

  it('changes the passphrase and refuses the old one', async () => {
    const { vault } = await boot()
    await vault.create('first passphrase', false)

    await expect(vault.changePassphrase({ passphrase: 'wrong' }, 'second passphrase')).rejects.toThrow('Wrong passphrase.')
    await vault.changePassphrase({ passphrase: 'first passphrase' }, 'second passphrase')

    const restarted = await boot()
    restarted.vault.lock()
    await expect(restarted.vault.unlock('first passphrase')).rejects.toThrow('Wrong passphrase.')
    await restarted.vault.unlock('second passphrase')
    expect(restarted.vault.state.value).toBe('unlocked')
  })

  it('reset deletes the keys on the node and in this browser', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])

    await vault.reset()

    expect(vault.state.value).toBe('absent')
    expect(node.heads).toEqual([])
    expect(remembered.size).toBe(0)
    expect(vault.providers.value).toEqual([])
  })

  it('creates the keys again after a reset in the same tab', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])

    await vault.reset()
    await vault.create('new horse battery', false)

    expect(vault.state.value).toBe('unlocked')
    expect(saveVault.mock.calls.at(-1)?.[0].predecessors).toEqual([])
    expect(await nodeProviders('new horse battery')).toEqual([])
  })

  it('creates a keypair with the vault and publishes it', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', true)

    const saved = Crypto.parseVaultPayload(node.heads[0].payload)
    expect(saved.keys).toHaveLength(1)
    expect(saveVault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(vault.ownKey.value).toBe('matches'))
    expect(publishUserKey.mock.calls[0][0]).toEqual({ key_id: saved.keys[0].id, public_key: saved.keys[0].public, has_recovery: true })

    // The next unlock finds its own key and publishes nothing.
    const restarted = await boot()
    await vi.waitFor(() => expect(restarted.vault.ownKey.value).toBe('matches'))
    expect(publishUserKey).toHaveBeenCalledTimes(1)
  })

  it('adds a keypair on unlock to a vault without one', async () => {
    const created = await Crypto.createVault('correct horse', false, { iterations: 500 })
    node.heads = [{ revision: 'R0000', predecessors: [], payload: JSON.stringify(created.payload), updated_at: '' }]
    const { vault } = await boot()

    await vault.unlock('correct horse')

    expect(saveVault.mock.calls[0][0].predecessors).toEqual(['R0000'])
    const saved = Crypto.parseVaultPayload(node.heads[0].payload)
    expect(Crypto.activeKeypair(saved.keys)).not.toBeNull()
    await vi.waitFor(() => expect(vault.ownKey.value).toBe('matches'))
    expect(directory[0].public_key).toBe(saved.keys[0].public)
  })

  it('reports a directory key that is not its own', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vi.waitFor(() => expect(vault.ownKey.value).toBe('matches'))
    directory.unshift({ key_id: 'k-other', public_key: btoa('o'.repeat(32)), has_recovery: false })

    const restarted = await boot()

    await vi.waitFor(() => expect(restarted.vault.ownKey.value).toBe('mismatch'))
    expect(publishUserKey).toHaveBeenCalledTimes(1)
  })

  it('publishes again after a rotation, and when the directory holds an older own key', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vi.waitFor(() => expect(vault.ownKey.value).toBe('matches'))

    publishUserKey.mockRejectedValueOnce(refused(503, 'vault_unavailable'))
    await vault.rotateKey()
    await vi.waitFor(() => expect(vault.ownKey.value).toBe('unavailable'))

    const restarted = await boot()
    await vi.waitFor(() => expect(restarted.vault.ownKey.value).toBe('matches'))
    const saved = Crypto.parseVaultPayload(node.heads[0].payload)
    expect(saved.keys).toHaveLength(2)
    expect(directory[0].public_key).toBe(Crypto.activeKeypair(saved.keys)?.public)
  })

  it('does not publish a keypair the holders did not keep', async () => {
    const created = await Crypto.createVault('correct horse', false, { iterations: 500 })
    node.heads = [{ revision: 'R0000', predecessors: [], payload: JSON.stringify(created.payload), updated_at: '' }]
    const { vault } = await boot()
    saveVault.mockRejectedValueOnce(refused(503, 'vault_unavailable'))

    await vault.unlock('correct horse')

    await vi.waitFor(() => expect(vault.ownKey.value).toBe('unavailable'))
    expect(publishUserKey).not.toHaveBeenCalled()
  })

  it('finishes the directory check before create and unlock resolve', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', true)
    expect(vault.ownKey.value).toBe('matches')
    expect(publishUserKey).toHaveBeenCalledTimes(1)

    vault.lock()
    directory.length = 0
    await vault.unlock('correct horse')

    expect(vault.ownKey.value).toBe('matches')
    expect(publishUserKey).toHaveBeenCalledTimes(2)
  })

  it('checks the directory on request and publishes a missing key once', async () => {
    const { vault } = await boot()
    expect(await vault.checkKey()).toBe('unknown')
    await vault.create('correct horse', false)
    directory.length = 0
    listUserKeys.mockClear()

    const answers = await Promise.all([vault.checkKey(), vault.checkKey()])

    expect(answers).toEqual(['matches', 'matches'])
    expect(listUserKeys).toHaveBeenCalledTimes(1)
    expect(publishUserKey).toHaveBeenCalledTimes(2)
    expect(directory).toHaveLength(1)
  })

  it('opens a retired keypair by id for an older bucket copy', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    const first = Crypto.parseVaultPayload(node.heads[0].payload).keys[0]
    await vault.rotateKey()

    const pair = await vault.openUserKey(first.id)

    expect(pair && btoa(String.fromCharCode(...pair.publicKey))).toBe(first.public)
    expect(await vault.openUserKey('not-in-this-vault')).toBeNull()
    vault.lock()
    await expect(vault.openUserKey(first.id)).rejects.toThrow('Unlock your provider keys first.')
  })

  it('ends a key disclosure binding when the vault locks or the session changes', async () => {
    const { vault, state } = await boot()
    await vault.create('correct horse', false)
    const beforeLock = vault.whileUnlocked()
    expect(beforeLock()).toBe(true)

    vault.lock()
    expect(beforeLock()).toBe(false)
    await vault.unlock('correct horse')
    expect(beforeLock()).toBe(false)
    const afterUnlock = vault.whileUnlocked()
    state.sessionEpoch.value += 1
    expect(afterUnlock()).toBe(false)
  })

  it('stays locked when a read that began before the lock finishes after it', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    const lifetime = vault.whileUnlocked()
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const held = vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce(async (...args) => {
      await gate
      return decrypt(...args)
    })

    const reading = vault.load()
    await vi.waitFor(() => expect(held).toHaveBeenCalled())
    vault.lock()
    release()
    await reading
    held.mockRestore()

    expect(vault.state.value).toBe('locked')
    expect(vault.loading.value).toBe(false)
    expect(lifetime()).toBe(false)
    expect(vault.whileUnlocked()()).toBe(false)
  })

  it('refuses a holder passphrase shorter than twelve characters', async () => {
    const { vault } = await boot()
    await expect(vault.create('eleven char', false)).rejects.toThrow('at least 12 characters')
    expect(saveVault).not.toHaveBeenCalled()

    await vault.create('twelve chars', false)
    await expect(vault.changePassphrase({ passphrase: 'twelve chars' }, 'too short')).rejects.toThrow(
      'at least 12 characters',
    )
    expect(saveVault).toHaveBeenCalledTimes(1)
  })

  it('opens the cached vault when no holder answers', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])
    readVault.mockRejectedValueOnce(refused(503, 'vault_unavailable'))

    const restarted = await boot()

    expect(restarted.vault.state.value).toBe('unlocked')
    expect(restarted.vault.fromCache.value).toBe(true)
    expect(restarted.vault.error.value).toBeNull()
    expect(restarted.vault.providers.value).toEqual([work])
    expect(restarted.vault.ownKey.value).toBe('unavailable')
    expect(listUserKeys).toHaveBeenCalledTimes(1)
  })

  it('unlocks the cached vault with the passphrase after a lock', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])
    vault.lock()
    expect(cached.size).toBe(1)
    readVault.mockRejectedValueOnce(refused(503, 'vault_unavailable'))

    const restarted = await boot()
    expect(restarted.vault.state.value).toBe('locked')
    await restarted.vault.unlock('correct horse')

    expect(restarted.vault.providers.value).toEqual([work])
  })

  it('reports an unreachable holder without a cache', async () => {
    readVault.mockRejectedValueOnce(refused(503, 'vault_unavailable'))

    const { vault } = await boot()

    expect(vault.fromCache.value).toBe(false)
    expect(vault.error.value).toBe('vault_unavailable')
    expect(vault.loaded.value).toBe(false)
  })

  it('forgets the cache with the vault and with the session', async () => {
    const { vault, state } = await boot()
    await vault.create('correct horse', false)
    await vault.reset()
    expect(cached.size).toBe(0)

    await vault.create('correct horse', false)
    expect(cached.size).toBe(1)
    state.sessionEpoch.value += 1
    await Promise.resolve()
    expect(cached.size).toBe(0)
  })

  it('shows the recreate notice once for a vault from before the holders', async () => {
    // An older portal remembered a key, but the holders have no vault and nothing is cached.
    remembered.set(SCOPE, {} as CryptoKey)
    const { vault } = await boot()
    expect(remembered.size).toBe(0)
    expect(vault.recreateNotice.value).toBe(true)

    const restarted = await boot()
    expect(restarted.vault.recreateNotice.value).toBe(true)
    restarted.vault.dismissRecreateNotice()
    expect(restarted.vault.recreateNotice.value).toBe(false)

    expect((await boot()).vault.recreateNotice.value).toBe(false)
  })

  it('creating the vault again ends the notice', async () => {
    remembered.set(SCOPE, {} as CryptoKey)
    const { vault } = await boot()

    await vault.create('correct horse', false)

    expect(vault.recreateNotice.value).toBe(false)
    await vault.reset()
    expect((await boot()).vault.recreateNotice.value).toBe(false)
  })

  it('shows no notice when another browser deleted a cached vault', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    node.heads = []

    const restarted = await boot()

    expect(restarted.vault.state.value).toBe('absent')
    expect(restarted.vault.recreateNotice.value).toBe(false)
    expect(cached.size).toBe(0)
  })

  it('reports a node without the route', async () => {
    node.unsupported = true
    const { vault } = await boot()

    expect(vault.state.value).toBe('unsupported')
    expect(vault.loaded.value).toBe(true)
    await expect(vault.create('x', false)).rejects.toThrow('cannot keep provider keys')
  })

  it('a session change forgets the key and starts over', async () => {
    const { vault, state } = await boot()
    await vault.create('correct horse', false)

    state.sessionEpoch.value += 1

    expect(vault.state.value).toBe('absent')
    expect(vault.loaded.value).toBe(false)
    expect(remembered.size).toBe(0)
  })

  it('a session change forgets every key, even in a tab that never loaded', async () => {
    const { vault, state } = await boot({ load: false })
    remembered.set('another scope', {} as CryptoKey)

    state.sessionEpoch.value += 1
    await Promise.resolve()

    expect(remembered.size).toBe(0)
    expect(vault.loaded.value).toBe(false)
  })

  it('refuses to create before the node answered, or after it failed to', async () => {
    const { vault } = await boot({ load: false })
    await expect(vault.create('x', false)).rejects.toThrow('could not be read yet')

    readVault.mockRejectedValueOnce(new Error('offline'))
    const failed = await boot()
    expect(failed.vault.error.value).toBe('offline')
    await expect(failed.vault.create('x', false)).rejects.toThrow('could not be read yet')
    expect(saveVault).not.toHaveBeenCalled()
  })

  it('refuses to save while locked', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    vault.lock()

    await expect(vault.saveProviders([work])).rejects.toThrow('Unlock your provider keys first.')
  })
})
