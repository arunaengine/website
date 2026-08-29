import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'
import { SESSION_KIND_LABELS, type UserSession } from '@/lib/api/sessions'
import { relativeTime } from '@/lib/utils'

function session(overrides: Partial<UserSession> = {}): UserSession {
  return {
    session_id: 's1',
    kind: 'assistant',
    label: 'Claude Code',
    created_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    revoked: false,
    current: false,
    ...overrides,
  }
}

const sessions = ref<UserSession[]>([])
const revoke = vi.fn(async () => false)
const load = vi.fn(async () => undefined)
const signOut = vi.fn(async () => undefined)

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const SpanStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const EmptyStub = defineComponent(() => () => null)

const SessionsPanel = compileClientComponent(new URL('./SessionsPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(SpanStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(EmptyStub),
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref({ id: 'u1' }) }) },
  '@/composables/useAuth': { useAuth: () => ({ signOut }) },
  '@/composables/useUserSessions': {
    useUserSessions: () => ({
      sessions,
      loading: ref(false),
      error: ref(null),
      busyIds: ref<string[]>([]),
      load,
      revoke,
    }),
  },
  '@/lib/api': { SESSION_KIND_LABELS },
  '@/lib/utils': { relativeTime },
})

beforeEach(() => {
  sessions.value = []
  revoke.mockClear()
  revoke.mockResolvedValue(false)
  signOut.mockClear()
})

describe('SessionsPanel', () => {
  it('lists a session with its kind, label and state', async () => {
    sessions.value = [session({ kind: 'portal', label: 'Portal sign-in', current: true })]
    const { root } = await mountApp(SessionsPanel)

    const text = content(root)
    expect(text).toContain('Portal sign-in')
    expect(text).toContain('this browser')
    expect(text).toContain('active')
  })

  it('marks a revoked session and offers no revoke action for it', async () => {
    sessions.value = [session({ revoked: true })]
    const { root } = await mountApp(SessionsPanel)

    expect(content(root)).toContain('revoked')
    expect(() => button(root, 'Revoke')).toThrow()
  })

  it('asks before revoking and only then calls the api', async () => {
    sessions.value = [session()]
    const { root } = await mountApp(SessionsPanel)

    await click(button(root, 'Revoke'))
    expect(revoke).not.toHaveBeenCalled()
    expect(content(root)).toContain('Revoke this session?')

    await click(button(root, 'Revoke'))
    expect(revoke).toHaveBeenCalledWith('s1')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out when the revoked session is this browser', async () => {
    // Revoking the bearer this page authenticates with must end the sign-in.
    sessions.value = [session({ current: true })]
    revoke.mockResolvedValueOnce(true)
    const { root } = await mountApp(SessionsPanel)

    await click(button(root, 'Revoke'))
    expect(content(root)).toContain('This signs you out here.')
    await click(button(root, 'Revoke'))

    expect(signOut).toHaveBeenCalledOnce()
  })
})
