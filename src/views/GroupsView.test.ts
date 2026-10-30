import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import { button, compileClientComponent, content, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const sessionEpoch = ref(1)
const pending = (id: string, group: string) => ({ request_id: id, group_id: group, user_id: 'u1', status: 'pending', created_at: '' })
const ownRequests = ref([pending('q1', 'g1'), pending('q2', 'g2')])
const withdrawRequest = vi.fn(async (_request: unknown) => undefined)
const reportGlobalError = vi.fn()
const route = reactive({ params: {}, hash: '', name: 'groups', query: {} as Record<string, string> })
const replace = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const GroupsView = compileClientComponent(new URL('./GroupsView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slot, useRoute: () => route, useRouter: () => ({ push: vi.fn(), replace }) },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/dashboard/PageHeader.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/RefreshButton.vue': moduleDefault(Empty),
  '@/components/ui/EmptyState.vue': moduleDefault(Empty),
  '@/components/ui/IconTile.vue': moduleDefault(Empty),
  '@/components/ui/SectionHeading.vue': moduleDefault(Slot),
  '@/components/ui/StatusMark.vue': moduleDefault(Empty),
  '@/components/ui/StatusPill.vue': moduleDefault(Empty),
  '@/components/ui/ViewToggle.vue': moduleDefault(Empty),
  '@/components/dashboard/GroupQuotaCards.vue': moduleDefault(Empty),
  '@/components/ui/ListSkeleton.vue': moduleDefault(Empty),
  '@/components/ui/SectionSkeleton.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(
    defineComponent({ props: { open: Boolean }, setup: (p) => () => h('dialog', { 'data-open': String(p.open) }) }),
  ),
  '@/components/groups/GroupDetail.vue': moduleDefault(Empty),
  '@/components/groups/JoinRequestButton.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({
      currentUser: ref({ id: 'u1' }),
      myGroups: ref([]),
      discoverableGroups: ref([]),
      loading: ref(false),
      bootstrapped: ref(true),
      refresh: vi.fn(),
      sessionEpoch,
    }),
  },
  '@/composables/useAuth': { useAuth: () => ({ authPending: ref(false) }) },
  '@/composables/useJoinRequests': {
    useJoinRequests: () => ({
      joinRequestsEnabled: ref(true),
      ownRequests,
      visibleOwnRequests: ownRequests,
      ownRequestsLoaded: ref(true),
      ownRequestsError: ref(null),
      ensureOwnRequestsLoaded: vi.fn(async () => undefined),
      loadOwnRequests: vi.fn(async () => undefined),
      withdrawRequest,
      busy: ref(false),
    }),
  },
  '@/composables/useGlobalErrors': { reportGlobalError },
  '@/composables/useGroupSelection': { reloadGroups: vi.fn() },
  '@/composables/useRefresh': { useRefresh: () => ({ busy: ref(false), refresh: vi.fn() }) },
  '@/composables/useViewMode': { useViewMode: () => ref('cards') },
  '@/composables/useFirstPaint': { useFirstPaint: () => ref(true) },
  '@/composables/usePageContext': { providePageContext: () => {} },
  '@/lib/utils': Utils,
})

const withdrawButtons = (root: Parameters<typeof nodes>[0]) =>
  nodes(root).filter((node) => node.tag === 'button' && content(node).includes('Withdraw'))

beforeEach(() => {
  vi.clearAllMocks()
  route.query = {}
})

describe('GroupsView create query', () => {
  it('opens Create group from ?create=group and drops the marker', async () => {
    route.query = { create: 'group', keep: '1' }
    const { root } = await mountApp(GroupsView)
    await flush()
    expect(nodes(root).find((node) => node.tag === 'dialog')?.props['data-open']).toBe('true')
    expect(replace).toHaveBeenCalledWith({ query: { keep: '1' } })
  })
})

describe('GroupsView join requests', () => {
  it('shows the wait on the Withdraw that was clicked, sends one at a time and frees it when it fails', async () => {
    let refuse: (err: unknown) => void = () => {}
    withdrawRequest.mockReturnValueOnce(new Promise<undefined>((_, reject) => (refuse = reject)))
    const { root } = await mountApp(GroupsView)
    await flush()
    void (withdrawButtons(root)[1].props.onClick as () => Promise<void>)()
    await flush()
    const [first, second] = withdrawButtons(root)
    expect(second.props['aria-busy']).toBe(true)
    expect(content(second)).toContain('Withdrawing the request')
    expect(first.props['aria-busy']).toBe(false)
    expect(first.props.disabled).toBe(true)
    await (first.props.onClick as () => Promise<void>)()
    expect(withdrawRequest).toHaveBeenCalledTimes(1)
    refuse(new Error('already answered'))
    await flush()
    expect(withdrawButtons(root)[1].props['aria-busy']).toBe(false)
    expect(withdrawButtons(root)[1].props.disabled).toBe(false)
    expect(reportGlobalError).toHaveBeenCalledWith('already answered')
  })

  it('keeps the wait of a withdrawal in a new session when one from the old session settles', async () => {
    let refuse: (err: unknown) => void = () => {}
    withdrawRequest.mockReturnValueOnce(new Promise<undefined>((_, reject) => (refuse = reject)))
    withdrawRequest.mockReturnValueOnce(new Promise<undefined>(() => {}))
    const { root } = await mountApp(GroupsView)
    await flush()
    void (withdrawButtons(root)[0].props.onClick as () => Promise<void>)()
    await flush()
    sessionEpoch.value++
    await flush()
    void (withdrawButtons(root)[0].props.onClick as () => Promise<void>)()
    await flush()
    refuse(new Error('the old session was refused'))
    await flush()
    expect(withdrawButtons(root)[0].props['aria-busy']).toBe(true)
    expect(reportGlobalError).not.toHaveBeenCalled()
  })
})
