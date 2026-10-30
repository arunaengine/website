import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import { SESSION_KIND_LABELS, type UserSession } from '@/lib/api/sessions'
import { formatDateTime, relativeTime } from '@/lib/utils'

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
const listed = ref(true)
const sessionEpoch = ref(1)
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
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent((_, { slots }) => () => h('div', slots.actions?.()))),
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(EmptyStub),
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref({ id: 'u1' }), sessionEpoch }) },
  '@/composables/useAuth': { useAuth: () => ({ signOut }) },
  '@/composables/useUserSessions': {
    useUserSessions: () => ({
      sessions,
      listed,
      loading: ref(false),
      error: ref(null),
      busyIds: ref<string[]>([]),
      load,
      revoke,
    }),
  },
  '@/lib/api': { SESSION_KIND_LABELS },
  '@/lib/utils': { formatDateTime, relativeTime },
})

beforeEach(() => {
  sessions.value = []
  listed.value = true
  revoke.mockClear()
  revoke.mockResolvedValue(false)
  signOut.mockClear()
})

describe('SessionsPanel', () => {
  it('names where a sign-in is, keeps its label and id for hover', async () => {
    sessions.value = [session({ kind: 'portal', label: 'Portal sign-in', current: true })]
    const { root } = await mountApp(SessionsPanel)
    const where = nodes(root).find((node) => node.tag === 'td' && content(node).includes('Portal'))!

    expect(content(where)).toContain('this browser')
    expect(content(root)).not.toContain('Portal sign-in')
    expect(where.props.title).toBe('Portal sign-in, s1')
  })

  it('shows this browser and the newest five first, the rest on request', async () => {
    sessions.value = Array.from({ length: 13 }, (_, index) =>
      session({ session_id: `s${index}`, created_at: new Date(Date.UTC(2026, 9, 1 + index)).toISOString() }))
    sessions.value[0] = { ...sessions.value[0], current: true }
    const { root } = await mountApp(SessionsPanel)
    const ids = () =>
      nodes(root).filter((node) => node.tag === 'td' && /, s\d+$/.test(String(node.props.title))).map((node) => String(node.props.title).split(', ').pop())

    expect(ids()).toEqual(['s0', 's12', 's11', 's10', 's9'])
    await click(button(root, 'Show all 13'))
    expect(ids()).toHaveLength(13)
  })

  it('signs out every other open sign-in after asking, never this browser', async () => {
    sessions.value = [
      session({ session_id: 'here', current: true }),
      session({ session_id: 'a' }),
      session({ session_id: 'b' }),
      session({ session_id: 'gone', revoked: true }),
    ]
    const { root } = await mountApp(SessionsPanel)

    await click(button(root, 'Sign out all others'))
    expect(revoke).not.toHaveBeenCalled()
    expect(content(root)).toContain('Sign out 2 other sign-ins?')
    await click(button(root, 'Sign out'))
    expect(revoke.mock.calls).toEqual([['a'], ['b']])
    expect(signOut).not.toHaveBeenCalled()
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
    expect(content(root)).toContain('Revoke this sign-in?')

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

  it('stops signing out the others once another token is applied', async () => {
    sessions.value = [session({ session_id: 'here', current: true }), session({ session_id: 'a' }), session({ session_id: 'b' })]
    revoke.mockImplementationOnce(async () => {
      sessionEpoch.value++
      listed.value = false
      return false
    })
    const { root } = await mountApp(SessionsPanel)

    await click(button(root, 'Sign out all others'))
    await click(button(root, 'Sign out'))
    expect(revoke.mock.calls).toEqual([['a']])
  })

  it('offers no sign out of the others until this session has listed them', async () => {
    sessions.value = [session({ session_id: 'here', current: true }), session({ session_id: 'a' })]
    listed.value = false
    const { root } = await mountApp(SessionsPanel)

    expect(button(root, 'Sign out all others').props.disabled).toBe(true)
  })
})
