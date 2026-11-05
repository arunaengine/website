import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import * as Utils from '@/lib/utils'

const setRealmAdmin = vi.fn(async (..._args: unknown[]): Promise<string[]> => [])
const loadAuthenticated = vi.fn(async () => undefined)
const listUsers = vi.fn(async () => ({
  users: [
    { user_id: 'me@r', name: 'Ada', subject_ids: [], attributes: {} },
    { user_id: 'u1@r', name: 'Bob', subject_ids: [], attributes: { email: 'bob@example.test' } },
  ],
  next_start_after: null,
}))
const admin = ref(true)
const Empty = defineComponent(() => () => null)
const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Label = defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })
const Badge = defineComponent({ props: { access: String, label: String }, setup: (p) => () => h('span', p.label ?? p.access) })
const ui = (name: string, component = Empty) => [`@/components/ui/${name}.vue`, moduleDefault(component)]
const AdminUsersView = compileClientComponent(new URL('./AdminUsersView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Pass },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@vueuse/core': { useDebounceFn: (fn: unknown) => fn },
  '@/lib/utils': Utils,
  '@/lib/api': { setRealmAdmin, DEACTIVATED_ATTRIBUTE: 'deactivated' },
  '@/components/dashboard/PageHeader.vue': moduleDefault(Empty),
  ...Object.fromEntries([
    ui('AccessBadge', Badge), ui('Badge', Pass), ui('Button', Button), ui('RefreshButton'), ui('Dialog'),
    ui('DialogContent'), ui('DialogTitle'), ui('EmptyState'), ui('ErrorPanel'), ui('Input'),
    ui('SectionHeading'), ui('Skeleton'), ui('Spinner', Label), ui('CopyButton'), ui('ConfirmDialog'), ui('Notice'),
  ]),
  '@/composables/aruna/state': { refreshContext: () => ({ epoch: 1, client: { token: 't' } }), sessionEpoch: ref(1) },
  '@/composables/useAruna': {
    useAruna: () => ({
      bootstrapped: ref(true), currentUser: ref({ id: 'me@r' }), canInspectUsers: ref(true), isRealmAdmin: admin,
      apiGroups: ref([]), listUsers, getUser: vi.fn(), searchUsers: vi.fn(), loadAuthenticated,
    }),
  },
  '@/composables/useAuth': { useAuth: () => ({ isAuthenticated: ref(true) }) },
  '@/composables/useRefresh': { useRefresh: () => ({ busy: ref(false), refresh: vi.fn() }) },
  '@/composables/useUserDirectory': { useUserDirectory: () => ({ resolveUser: vi.fn() }) },
})

afterEach(() => {
  admin.value = true
  vi.clearAllMocks()
})

describe('realm admins in the user directory', () => {
  it('makes a user realm admin and removes the role again', async () => {
    const mounted = await mountApp(AdminUsersView)
    const row = (name: string) => element(mounted.root, (node) => node.tag === 'tr' && content(node).includes(name))
    const grant = (name: string) => element(row(name), (node) => node.tag === 'button' && content(node).includes('Make admin'))
    expect(content(row('Ada'))).toContain('Realm admin')
    expect(content(row('Ada'))).not.toContain('Make admin')
    setRealmAdmin.mockResolvedValueOnce(['me@r', 'u1@r'])
    await click(grant('Bob'))
    expect(setRealmAdmin).toHaveBeenCalledWith('u1@r', true, { token: 't' })
    expect(content(row('Bob'))).toContain('Realm admin')
    setRealmAdmin.mockResolvedValueOnce(['me@r'])
    await click(element(row('Bob'), (node) => node.props['aria-label'] === 'Remove realm admin'))
    expect(setRealmAdmin).toHaveBeenLastCalledWith('u1@r', false, { token: 't' })
    expect(content(row('Bob'))).toContain('none')
    expect(grant('Bob').props.disabled).toBe(false)
    expect(loadAuthenticated).not.toHaveBeenCalled()
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('shows a refused removal and reloads the own roles after removing oneself', async () => {
    const mounted = await mountApp(AdminUsersView)
    const remove = () => element(mounted.root, (node) => node.props['aria-label'] === 'Remove realm admin')
    setRealmAdmin.mockRejectedValueOnce(new Error('The last realm admin cannot be removed'))
    await click(remove())
    expect(content(mounted.root)).toContain('The last realm admin cannot be removed')
    expect(remove().props.disabled).toBe(false)
    setRealmAdmin.mockResolvedValueOnce(['u1@r'])
    await click(remove())
    expect(content(mounted.root)).not.toContain('The last realm admin cannot be removed')
    expect(loadAuthenticated).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })

  it('offers no admin controls to a directory reader without the realm admin role', async () => {
    admin.value = false
    const mounted = await mountApp(AdminUsersView)
    expect(content(mounted.root)).toContain('Bob')
    expect(content(mounted.root)).not.toContain('Realm role')
    expect(content(mounted.root)).not.toContain('Make admin')
    expect(nodes(mounted.root).some((node) => node.props?.['aria-label'] === 'Remove realm admin')).toBe(false)
    mounted.app.unmount()
  })
})
