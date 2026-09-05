import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateBrowserProvider } from '@/lib/assistant/browserProviders'
import * as Crypto from '@/lib/vault/crypto'

// A stand-in node: one payload, one revision, a stale write refused with 409.
// Every restart below re-imports the modules, so the fakes tell the status
// apart by a field rather than by a class that would differ per import.
const node = { payload: null as string | null, revision: 0, unsupported: false }
function refused(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}
function status(error: unknown): number {
  return (error as { status?: number })?.status ?? 0
}
const readVault = vi.fn(async () => {
  if (node.unsupported) throw refused(404, 'no such route')
  return { payload: node.payload, revision: node.revision, updated_at: null }
})
const saveVault = vi.fn(async (request: { payload: string; revision?: number }) => {
  if (request.revision !== undefined && request.revision !== node.revision) throw refused(409, 'stale')
  node.payload = request.payload
  node.revision += 1
  return { payload: node.payload, revision: node.revision, updated_at: '2026-09-06T00:00:00Z' }
})
// A delete leaves a tombstone: the revision keeps counting, as on the node.
const deleteVault = vi.fn(async () => {
  if (node.payload !== null) node.revision += 1
  node.payload = null
})

// The remembered key, as the browser's IndexedDB would keep it.
const remembered = new Map<string, CryptoKey>()

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  apiRequest: async () => {
    throw new Error('No other request belongs in this test.')
  },
  defaultApiBaseUrl: () => '/api/v1',
  readVault,
  saveVault,
  deleteVault,
  vaultConflicted: (error: unknown) => status(error) === 409,
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
    clear: async () => {
      remembered.clear()
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
  const payload = Crypto.parseVaultPayload(node.payload ?? '')
  const key = await Crypto.unlockVault(payload, passphrase)
  return (await Crypto.openData(key, payload)).providers
}

beforeEach(() => {
  node.payload = null
  node.revision = 0
  node.unsupported = false
  remembered.clear()
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
    expect(vault.remoteRevision.value).toBe(1)
    expect(saveVault.mock.calls[0][0].revision).toBe(0)
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

  it('saves with the held revision and folds in what another browser wrote', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])
    expect(vault.remoteRevision.value).toBe(2)

    // Another browser adds a provider behind this one's back.
    const other = await boot()
    await other.vault.saveProviders([...other.vault.providers.value, local])
    expect(node.revision).toBe(3)

    const edited = { ...work, label: 'Work (edited)' }
    await vault.saveProviders([edited])

    expect(saveVault.mock.calls.map((call) => call[0].revision)).toEqual([0, 1, 2, 2, 3])
    expect(vault.remoteRevision.value).toBe(4)
    expect(vault.providers.value).toEqual([edited, local])
    expect(await nodeProviders('correct horse')).toEqual([edited, local])
  })

  it('gives up when the keys were replaced in another browser', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)

    // The other browser reset the keys and set them up again with a new master key.
    const other = await boot()
    await other.vault.reset()
    await other.vault.create('new horse', false)
    await other.vault.saveProviders([local])

    await expect(vault.saveProviders([work])).rejects.toThrow('changed in another browser')
    expect(vault.state.value).toBe('locked')
  })

  it('opens the keys with the recovery code and sets a new passphrase from it', async () => {
    const { vault } = await boot()
    const code = await vault.create('forgotten', true)
    await vault.saveProviders([work])
    vault.lock()

    await expect(vault.unlockWithRecovery('nope')).rejects.toThrow('The recovery code is wrong.')
    await vault.unlockWithRecovery(code ?? '')
    expect(vault.providers.value).toEqual([work])

    await vault.changePassphrase({ recoveryCode: code ?? '' }, 'remembered')
    vault.lock()
    await vault.unlock('remembered')
    expect(vault.state.value).toBe('unlocked')
    expect(await nodeProviders('remembered')).toEqual([work])
  })

  it('changes the passphrase and refuses the old one', async () => {
    const { vault } = await boot()
    await vault.create('first', false)

    await expect(vault.changePassphrase({ passphrase: 'wrong' }, 'second')).rejects.toThrow('Wrong passphrase.')
    await vault.changePassphrase({ passphrase: 'first' }, 'second')

    const restarted = await boot()
    restarted.vault.lock()
    await expect(restarted.vault.unlock('first')).rejects.toThrow('Wrong passphrase.')
    await restarted.vault.unlock('second')
    expect(restarted.vault.state.value).toBe('unlocked')
  })

  it('reset deletes the keys on the node and in this browser', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])

    await vault.reset()

    expect(vault.state.value).toBe('absent')
    expect(node.payload).toBeNull()
    expect(remembered.size).toBe(0)
    expect(vault.providers.value).toEqual([])
  })

  it('creates the keys again after a reset in the same tab', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    await vault.saveProviders([work])

    await vault.reset()
    expect(vault.remoteRevision.value).toBe(node.revision)
    await vault.create('new horse', false)

    expect(vault.state.value).toBe('unlocked')
    expect(saveVault.mock.calls.at(-1)?.[0].revision).toBe(3)
    expect(await nodeProviders('new horse')).toEqual([])
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

  it('refuses to save while locked', async () => {
    const { vault } = await boot()
    await vault.create('correct horse', false)
    vault.lock()

    await expect(vault.saveProviders([work])).rejects.toThrow('Unlock your provider keys first.')
  })
})
