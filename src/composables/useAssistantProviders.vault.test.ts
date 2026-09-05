import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { BrowserProvider } from '@/lib/assistant/browserProviders'
import type { VaultState } from './useUserVault'

// The keys kept on the node, as the vault composable would serve them.
const vault = {
  state: ref<VaultState>('unlocked'),
  providers: ref<BrowserProvider[]>([]),
  load: vi.fn(async () => {}),
  saveProviders: vi.fn(async (next: BrowserProvider[]) => {
    if (vault.state.value !== 'unlocked') throw new Error('Unlock your provider keys first.')
    vault.providers.value = next
  }),
}

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAssistantProviders: vi.fn(async () => ({ providers: [] })),
}))
vi.mock('./useUserVault', () => ({ useUserVault: () => vault }))

const { useAssistantProviders } = await import('./useAssistantProviders')

const session: BrowserProvider = {
  id: 'browser-session',
  kind: 'anthropic',
  label: 'Session key',
  model: 'claude',
  apiKey: 'sk-session',
}
const sealed: BrowserProvider = {
  id: 'browser-node',
  kind: 'anthropic',
  label: 'Node key',
  model: 'claude',
  apiKey: 'sk-node',
  models: [{ id: 'claude' }],
}

async function ids() {
  await Promise.resolve()
  return useAssistantProviders().providers.value.map((provider) => provider.provider_id)
}

beforeEach(async () => {
  vault.state.value = 'unlocked'
  vault.providers.value = [sealed]
  vault.saveProviders.mockClear()
  const providers = useAssistantProviders()
  for (const id of ['browser-session', 'browser-moved']) {
    if (providers.storageOf(id) === 'session') await providers.remove(id)
  }
})

describe('providers kept on the node', () => {
  it('lists the sealed keys next to the session ones', async () => {
    const providers = useAssistantProviders()
    await providers.create(session)

    expect(await ids()).toEqual(['browser-session', 'browser-node'])
    expect(providers.storageOf('browser-session')).toBe('session')
    expect(providers.storageOf('browser-node')).toBe('node')
    expect(providers.direct('browser-node')?.apiKey).toBe('sk-node')
  })

  it('stores a new provider on the node when asked to', async () => {
    const providers = useAssistantProviders()
    await providers.create({ ...session, id: 'browser-moved' }, 'node')

    expect(vault.saveProviders).toHaveBeenCalledOnce()
    expect(vault.saveProviders.mock.calls[0][0].map((entry) => entry.id)).toEqual(['browser-node', 'browser-moved'])
    expect(providers.storageOf('browser-moved')).toBe('node')
    await providers.remove('browser-moved')
    expect(providers.storageOf('browser-moved')).toBeNull()
  })

  it('moves a provider to the node and back to this session', async () => {
    const providers = useAssistantProviders()
    await providers.create(session)

    await providers.move('browser-session', 'node')
    expect(providers.storageOf('browser-session')).toBe('node')
    expect(vault.providers.value.map((entry) => entry.id)).toEqual(['browser-node', 'browser-session'])
    expect(await ids()).toEqual(['browser-node', 'browser-session'])

    await providers.move('browser-session', 'session')
    expect(providers.storageOf('browser-session')).toBe('session')
    expect(vault.providers.value.map((entry) => entry.id)).toEqual(['browser-node'])
    expect(providers.direct('browser-session')?.apiKey).toBe('sk-session')
  })

  it('keeps a provider in this session when the node refuses the move', async () => {
    const providers = useAssistantProviders()
    await providers.create(session)
    vault.saveProviders.mockRejectedValueOnce(new Error('offline'))

    await expect(providers.move('browser-session', 'node')).rejects.toThrow('offline')

    expect(providers.storageOf('browser-session')).toBe('session')
  })

  it('hides the sealed keys while they are locked', async () => {
    const providers = useAssistantProviders()
    await providers.create(session)
    vault.state.value = 'locked'

    expect(await ids()).toEqual(['browser-session'])
    expect(providers.direct('browser-node')).toBeNull()
    await expect(providers.create({ ...session, id: 'browser-moved' }, 'node')).rejects.toThrow('Unlock your provider keys first.')
  })
})
