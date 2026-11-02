import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { CentralAssistant } from '@/lib/api'

const own = {
  provider_id: '01JCNCTR0123456789ABCDEFGH',
  kind: 'openai' as const,
  label: 'My OpenAI key',
  models: [{ id: 'gpt-5' }],
  status: 'ready' as const,
  created_at: '2026-01-01T00:00:00Z',
}
const setup: CentralAssistant = {
  kind: 'openai_compatible',
  label: 'Realm assistant',
  models: [{ id: 'deepseek-v4.1' }],
  default_model: 'deepseek-v4.1',
  daily_limit: 50,
  used_today: 12,
  resets_at: '2026-11-03T00:00:00Z',
}
const getCentralAssistant = vi.fn(async (): Promise<CentralAssistant | null> => setup)

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAssistantProviders: vi.fn(async () => ({ providers: [own] })),
  getCentralAssistant,
}))
vi.mock('./useUserVault', () => ({
  useUserVault: () => ({ state: ref('locked'), providers: ref([]), load: vi.fn(async () => {}) }),
}))

const { authToken, userInfo } = await import('./aruna/state')
const { useAssistantProviders } = await import('./useAssistantProviders')

function ids() {
  return useAssistantProviders().providers.value.map((provider) => provider.provider_id)
}

beforeEach(() => {
  authToken.value = 'token'
  userInfo.value = { user: { user_id: `user-${Math.random()}` } } as unknown as typeof userInfo.value
  getCentralAssistant.mockClear()
})

describe('central assistant entry', () => {
  it('comes first when an admin set it up', async () => {
    await useAssistantProviders().load()

    expect(ids()).toEqual(['central', own.provider_id])
    expect(useAssistantProviders().central.value?.used_today).toBe(12)
  })

  it('is absent without a setup', async () => {
    getCentralAssistant.mockResolvedValueOnce(null)

    await useAssistantProviders().load()

    expect(ids()).toEqual([own.provider_id])
  })

  it('stays hidden until the admin allows a model', async () => {
    getCentralAssistant.mockResolvedValueOnce({ ...setup, models: [] })

    await useAssistantProviders().load()

    expect(ids()).toEqual([own.provider_id])
  })

  it('keeps own providers when the setup cannot be read', async () => {
    getCentralAssistant.mockRejectedValueOnce(new Error('503'))

    await useAssistantProviders().load()

    expect(ids()).toEqual([own.provider_id])
  })

  it('reads the usage again after a turn', async () => {
    const providers = useAssistantProviders()
    await providers.load()
    getCentralAssistant.mockResolvedValueOnce({ ...setup, used_today: 13 })

    await providers.refreshCentral()

    expect(providers.central.value?.used_today).toBe(13)
  })
})
