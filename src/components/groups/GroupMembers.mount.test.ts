import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Utils from '@/lib/utils'
import { searchUsers } from '@/composables/aruna/users'

const search = vi.fn(searchUsers)
const directory = new Map<string, { user_id: string; name: string; attributes: Record<string, string>; merged_into?: string }>()
const addGroupMember = vi.fn(async () => undefined)
const removeGroupMember = vi.fn(async (..._args: unknown[]) => undefined)
const revokeMemberTokens = vi.fn(async (..._args: unknown[]) => ({ revoked: 2, all_tokens: false }))
const ConfirmStub = defineComponent({
  props: { open: Boolean, title: String, description: String },
  emits: ['confirm'],
  setup: (props, { emit }) => () => props.open
    ? h('div', { 'data-confirm': props.title }, [props.description, h('button', { onClick: () => emit('confirm') }, 'Confirm')])
    : null,
})
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup: (props, { emit, attrs }) => () => h('input', {
    ...attrs, value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})
const GroupMembers = compileClientComponent(new URL('./GroupMembers.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@vueuse/core': { useDebounceFn: (fn: unknown) => fn },
  '@/lib/utils': Utils,
  '@/composables/useAruna': {
    useAruna: () => ({ searchUsers: search, addGroupMember, removeGroupMember, saving: ref(false), sessionEpoch: ref(1), currentUser: ref({ id: 'owner' }), realm: ref({ id: 'own' }) }),
  },
  '@/composables/useFederation': { homeRealmLabel: (id: string) => (id.endsWith('@other') ? 'Giessen Data' : null) },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(), cachedUser: (id: string) => directory.get(id) }),
  },
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/ui/AccessBadge.vue': moduleDefault(Empty),
  '@/components/ui/Popover.vue': moduleDefault(defineComponent((_, { slots }) => () => h('div', slots.default?.()))),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/components/ui/ConfirmDialog.vue': moduleDefault(ConfirmStub),
  '@/composables/aruna/state': { refreshContext: () => ({ epoch: 1, client: { token: 't' } }) },
  '@/lib/api': { revokeMemberTokens },
})

afterEach(() => {
  directory.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('group member picker', () => {
  it('searches outside members using the public directory and adds the selected user', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    const fetch = vi.fn(async (_input: URL) => new Response(JSON.stringify({
      users: [{ user_id: 'invitee', name: 'Invited Member' }], next_start_after: null,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Empty }] })
    await router.push('/')
    await router.isReady()
    const mounted = await mountApp(GroupMembers, {
      router,
      props: { groupId: 'g1', members: [], roles: [{ role_id: 'r1', name: 'user' }], canManage: true },
    })
    await typeValue(element(mounted.root, (node) => node.tag === 'input'), 'Invited')
    await search.mock.results[0]!.value
    await flush()
    const url = new URL(String(fetch.mock.calls[0]![0]))
    expect(url.pathname).toBe('/api/v1/access/users/search')
    expect(url.searchParams.has('group_id')).toBe(false)
    expect(url.searchParams.get('q')).toBe('Invited')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).includes('Invited Member')))
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).trim() === 'Add'))
    expect(addGroupMember).toHaveBeenCalledWith('g1', { user_id: 'invitee', role_ids: ['r1'] })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('shows the wait on the removal that was clicked, sends one at a time and frees it when it fails', async () => {
    let refuse: (err: unknown) => void = () => {}
    removeGroupMember.mockReturnValueOnce(new Promise<undefined>((_, reject) => (refuse = reject)))
    const members = [{ user_id: 'u1', name: 'Ada', roles: [{ role_id: 'r1', name: 'user' }] }]
    const mounted = await mountApp(GroupMembers, {
      props: { groupId: 'g1', members, roles: [{ role_id: 'r1', name: 'user' }], canManage: true },
    })
    const removeButton = () => element(mounted.root, (node) => node.tag === 'button' && content(node).includes('Remove'))
    const revoke = () => element(mounted.root, (node) => node.tag === 'button' && node.props['aria-label'] === 'Revoke user')
    void (removeButton().props.onClick as () => Promise<void>)()
    await flush()
    expect(removeButton().props['aria-busy']).toBe(true)
    expect(content(removeButton())).toContain('Removing the member')
    expect(revoke().props['aria-busy']).toBe(false)
    expect(revoke().props.disabled).toBe(true)
    await click(revoke())
    expect(removeGroupMember).toHaveBeenCalledTimes(1)
    refuse(new Error('last admin'))
    await flush()
    expect(removeButton().props['aria-busy']).toBe(false)
    expect(removeButton().props.disabled).toBe(false)
    expect(content(mounted.root)).toContain('last admin')
    mounted.app.unmount()
  })

  it('names the account a merged member now belongs to', async () => {
    directory.set('b1@own', { user_id: 'b1@own', name: 'Alice', attributes: {}, merged_into: 'a1@own' })
    const members = [{ user_id: 'b1@own', name: 'Bob', roles: [{ role_id: 'r1', name: 'user' }] }]
    const mounted = await mountApp(GroupMembers, {
      props: { groupId: 'g1', members, roles: [{ role_id: 'r1', name: 'user' }], canManage: false },
    })
    expect(content(mounted.root)).toContain('Alice (merged)')
    expect(content(mounted.root)).not.toContain('Bob')
    mounted.app.unmount()
  })

  it('labels admins and revokes the group access of one member after a confirmation', async () => {
    const members = [
      { user_id: 'a1', name: 'Ada', roles: [{ role_id: 'r1', name: 'owners' }], admin: true },
      { user_id: 'u1', name: 'Bob', roles: [{ role_id: 'r2', name: 'user' }], admin: false },
    ]
    const mounted = await mountApp(GroupMembers, {
      props: { groupId: 'g1', members, roles: [{ role_id: 'r2', name: 'user' }], canManage: true },
    })
    const row = (name: string) => element(mounted.root, (node) => node.tag === 'tr' && content(node).includes(name))
    expect(content(row('Ada'))).toContain('Admin')
    expect(content(row('Bob'))).not.toContain('Admin')
    await click(element(row('Bob'), (node) => node.tag === 'button' && content(node).includes('Revoke access')))
    expect(revokeMemberTokens).not.toHaveBeenCalled()
    const dialog = element(mounted.root, (node) => node.props['data-confirm'] === 'Revoke access to this group')
    await click(element(dialog, (node) => node.tag === 'button'))
    expect(revokeMemberTokens).toHaveBeenCalledWith('g1', 'u1', { token: 't' })
    expect(content(mounted.root)).toContain('2 tokens of Bob revoked.')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
