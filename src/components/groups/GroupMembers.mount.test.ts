import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Utils from '@/lib/utils'
import { searchUsers } from '@/composables/aruna/users'

const search = vi.fn(searchUsers)
const addGroupMember = vi.fn(async () => undefined)
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
    useAruna: () => ({ searchUsers: search, addGroupMember, saving: ref(false), sessionEpoch: ref(1), currentUser: ref({ id: 'owner' }) }),
  },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(), cachedUser: () => undefined }),
  },
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/ui/AccessBadge.vue': moduleDefault(Empty),
  '@/components/ui/Popover.vue': moduleDefault(Empty),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
})

afterEach(() => {
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
})
