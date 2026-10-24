import * as VueRuntime from 'vue'
import { defineComponent, h, inject, provide, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as RouteTab from '@/composables/useRouteTab'
import * as Api from '@/lib/api'
import * as GroupAdmin from '@/lib/groupAdmin'
import * as Quota from '@/lib/quota'
import * as Utils from '@/lib/utils'

const TAB_NAMES = ['stats', 'members', 'roles', 'sources', 'storage', 'policies']
const leaveGroup = vi.fn(async (_group: string) => undefined)
const REALM = 'realm-1'
interface Role {
  role_id: string
  name: string
  permissions: Record<string, string>
  assigned_users: string[]
}

const ADMIN_ROLE: Role = {
  role_id: 'r1',
  name: 'admin',
  permissions: { [`/${REALM}/g/g1/admin/**`]: 'write', [`/${REALM}/g/g1/data/**`]: 'write' },
  assigned_users: ['user-1'],
}
const MEMBER_ROLE: Role = {
  role_id: 'r2',
  name: 'member',
  permissions: { [`/${REALM}/g/g1/data/**`]: 'read' },
  assigned_users: ['user-1'],
}
const group = ref({ display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [ADMIN_ROLE] })

const listGroupConnectors = vi.fn(async () => ({ connectors: [{}, {}] }))
const listGroupBackends = vi.fn(async () => ({ backends: [{}, {}, {}] }))
const writesDisabled = ref(false)
const joinRequestsEnabled = ref(false)
const inboxCount = ref<number | null>(null)
const inboxError = ref<string | null>(null)
const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const SELECT = Symbol('select tab')
const TabsStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    provide(SELECT, (value: string) => emit('update:modelValue', value))
    return () => h('div', { 'data-active': props.modelValue }, slots.default?.())
  },
})
const TriggerStub = defineComponent({
  props: { value: { type: String, default: '' } },
  setup(props, { slots }) {
    const select = inject<(value: string) => void>(SELECT)!
    return () => h('button', { 'data-tab': props.value, onClick: () => select(props.value) }, slots.default?.())
  },
})
const PanelStub = defineComponent({
  props: { value: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('section', { 'data-panel': props.value }, slots.default?.()),
})

const DeleteDialogStub = defineComponent({
  props: { open: { type: Boolean, default: false } },
  emits: ['deleted'],
  setup: (props, { emit }) => () =>
    h('div', { 'data-delete-dialog': String(props.open), onClick: () => emit('deleted') }),
})

const InboxStub = defineComponent({
  emits: ['count', 'load-error'],
  setup(_, { emit }) {
    VueRuntime.watch(inboxCount, (count) => emit('count', count), { immediate: true })
    VueRuntime.watch(inboxError, (error) => emit('load-error', error), { immediate: true })
    return () => h('div', { 'data-request-inbox': '' }, 'Pending request inbox')
  },
})

const GroupDetail = compileClientComponent(new URL('./GroupDetail.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/lib/api': Api,
  '@/lib/groupAdmin': GroupAdmin,
  '@/lib/quota': Quota,
  '@/lib/utils': Utils,
  '@/lib/config': { featureEnabled: () => true },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
  '@/composables/useRouteTab': RouteTab,
  '@/composables/useJoinRequests': { useJoinRequests: () => ({ joinRequestsEnabled }) },
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: (key: string) => !hiddenFeatures.has(key) }) },
  '@/composables/useAruna': {
    useAruna: () => ({
      getGroup: vi.fn(async () => group.value),
      getGroupUsage: vi.fn(async () => ({ quota: null })),
      getGroupUsageHistory: vi.fn(async () => ({ points: [] })),
      listGroupMembers: vi.fn(async () => ({ members: [] })),
      listGroupMetadata: vi.fn(async () => ({ documents: [] })),
      listGroupConnectors,
      listGroupBackends,
      leaveGroup,
      saving: ref(false),
      currentUser: ref({ id: 'user-1' }),
    }),
  },
  '@/components/ui/Button.vue': moduleDefault(Passthrough),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/QuotaBar.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/EmptyState.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/components/ui/Tabs.vue': moduleDefault(TabsStub),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(TriggerStub),
  '@/components/ui/TabsContent.vue': moduleDefault(PanelStub),
  '@/components/groups/ConnectorsSection.vue': moduleDefault(Empty),
  '@/components/groups/RepositoriesSection.vue': moduleDefault(Empty),
  '@/components/groups/StorageSection.vue': moduleDefault(
    defineComponent({ props: { datasetBucket: String }, setup: (p) => () => h('div', { 'data-dataset-bucket': p.datasetBucket }) }),
  ),
  '@/components/groups/GroupLocationSection.vue': moduleDefault(Empty),
  '@/components/groups/GroupMembers.vue': moduleDefault(Empty),
  '@/components/groups/GroupDetailSkeleton.vue': moduleDefault(Empty),
  '@/components/groups/GroupRoles.vue': moduleDefault(Empty),
  '@/components/groups/JoinRequestButton.vue': moduleDefault(Empty),
  '@/components/groups/JoinRequestsInbox.vue': moduleDefault(InboxStub),
  '@/components/groups/RenameGroupDialog.vue': moduleDefault(Empty),
  '@/components/groups/DeleteGroupDialog.vue': moduleDefault(DeleteDialogStub),
  '@/components/groups/UsageHistoryChart.vue': moduleDefault(Empty),
  '@/components/policies/PoliciesSection.vue': moduleDefault(Empty),
  '@/components/policies/EffectivePolicies.vue': moduleDefault(Empty),
  '@/components/assistant/AskAiButton.vue': moduleDefault(Empty),
})

const hiddenFeatures = new Set<string>()

async function mount(initial: string, onDeleted?: () => void) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/groups', name: 'groups', component: Empty },
      { path: '/app/groups/:id', name: 'group', component: Empty },
      { path: '/app/metadata/:id', name: 'dataset', component: Empty },
      { path: '/app/metadata', name: 'datasets', component: Empty },
    ],
  })
  await router.push(initial)
  await router.isReady()
  const mounted = await mountApp(GroupDetail, { router, props: { groupId: 'g1', onDeleted } })
  await flush()
  await flush()
  return { ...mounted, router }
}

// The tab setter replaces the route without awaiting it; drain microtasks
// until the navigation lands rather than waiting on a clock.
async function settled(router: Router, expected: string | undefined) {
  for (let round = 0; round < 20; round += 1) {
    if (router.currentRoute.value.query.tab === expected) return
    await flush()
  }
}

describe('Group detail tabs', () => {
  beforeEach(() => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [ADMIN_ROLE] }
  })

  it('keeps every tab on the group route', async () => {
    const { root, router, errors } = await mount('/app/groups/g1?tab=members')
    expect(errors).toEqual([])

    for (const name of TAB_NAMES) {
      await click(element(root, (node) => node.props['data-tab'] === name))
      const expected = name === 'stats' ? undefined : name
      await settled(router, expected)
      expect(router.currentRoute.value.query.tab).toBe(expected)
      expect(router.currentRoute.value.params.id).toBe('g1')
      expect(router.currentRoute.value.name).toBe('group')
      expect(element(root, (node) => node.props['data-active'] !== undefined).props['data-active']).toBe(name)
    }
  })

  it('opens the tab a deep link names', async () => {
    const { root } = await mount('/app/groups/g1?tab=roles')
    expect(element(root, (node) => node.props['data-active'] !== undefined).props['data-active']).toBe('roles')
  })

  it('opens deep-linked data sources when both of its features are hidden', async () => {
    hiddenFeatures.add('connectors').add('repositories')
    try {
      for (const link of ['/app/groups/g1?tab=sources', '/app/groups/g1?connector=c1']) {
        const { root } = await mount(link)
        expect(element(root, (node) => node.props['data-active'] !== undefined).props['data-active']).toBe('sources')
        expect(nodes(root).some((node) => node.props['data-tab'] === 'sources')).toBe(false)
      }
    } finally {
      hiddenFeatures.clear()
    }
  })
})

describe('Group tab counts', () => {
  function tabText(root: Parameters<typeof nodes>[0], name: string) {
    return content(element(root, (node) => node.props['data-tab'] === name))
  }

  beforeEach(() => {
    listGroupConnectors.mockClear()
    listGroupBackends.mockClear()
  })

  it('loads the source and storage counts before a tab is opened', async () => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [ADMIN_ROLE] }
    const { root, errors } = await mount('/app/groups/g1')
    expect(errors).toEqual([])
    expect(listGroupConnectors).toHaveBeenCalledWith('g1')
    expect(listGroupBackends).toHaveBeenCalledWith('g1')
    expect(tabText(root, 'sources')).toContain('2')
    expect(tabText(root, 'storage')).toContain('3')
  })

  it('tells the storage tab which bucket the dataset location uses', async () => {
    const located = { ...group.value, roles: [ADMIN_ROLE], dataset_location: { bucket: 'datasets-g1', prefix: '' } }
    group.value = located
    const { root } = await mount('/app/groups/g1?tab=storage')
    expect(nodes(root).some((node) => node.props['data-dataset-bucket'] === 'datasets-g1')).toBe(true)
  })

  it('skips the storage count for a member who is not an admin', async () => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [MEMBER_ROLE] }
    const { root } = await mount('/app/groups/g1')
    expect(listGroupBackends).not.toHaveBeenCalled()
    expect(tabText(root, 'sources')).toContain('2')
  })

  it('keeps the count unknown when the node refuses it', async () => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [ADMIN_ROLE] }
    listGroupBackends.mockRejectedValueOnce(new Api.ApiError(403, 'forbidden'))
    const { root, errors } = await mount('/app/groups/g1')
    expect(errors).toEqual([])
    expect(tabText(root, 'storage').trim()).toBe('Storage')
  })
})

describe('Group delete control', () => {
  function deleteButton(root: Parameters<typeof nodes>[0]) {
    return nodes(root).find((node) => content(node).trim() === 'Delete group' && node.props.variant === 'outline')
  }
  function deleteDialog(root: Parameters<typeof nodes>[0]) {
    return element(root, (node) => 'data-delete-dialog' in node.props)
  }

  beforeEach(() => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [ADMIN_ROLE] }
    writesDisabled.value = false
  })

  it('offers the delete only to a group admin', async () => {
    expect(deleteButton((await mount('/app/groups/g1')).root)).toBeDefined()

    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [MEMBER_ROLE] }
    expect(deleteButton((await mount('/app/groups/g1')).root)).toBeUndefined()
  })

  it('opens the delete dialog and passes its result to the page', async () => {
    const onDeleted = vi.fn()
    const { root } = await mount('/app/groups/g1', onDeleted)

    expect(deleteDialog(root).props['data-delete-dialog']).toBe('false')
    await click(deleteButton(root)!)
    expect(deleteDialog(root).props['data-delete-dialog']).toBe('true')

    await click(deleteDialog(root))
    expect(onDeleted).toHaveBeenCalledOnce()
  })

  it('holds the delete back without a connection', async () => {
    writesDisabled.value = true
    const { root } = await mount('/app/groups/g1')

    expect(deleteButton(root)!.props.disabled).toBe(true)
    expect(deleteButton(root)!.props.title).toBe('offline')
  })
})

describe('Group rename control', () => {
  function renameButtons(root: Parameters<typeof nodes>[0]) {
    return nodes(root).filter((node) => node.props['aria-label'] === 'Rename group')
  }

  it('offers the rename only to a group admin', async () => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [ADMIN_ROLE] }
    expect(renameButtons((await mount('/app/groups/g1')).root)).toHaveLength(1)

    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [MEMBER_ROLE] }
    expect(renameButtons((await mount('/app/groups/g1')).root)).toHaveLength(0)
  })
})


describe('Group notifications', () => {
  beforeEach(() => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [ADMIN_ROLE] }
    joinRequestsEnabled.value = true
    inboxCount.value = null
    inboxError.value = null
  })

  it('shows the pending request box beside Leave group and links to Members', async () => {
    const mounted = await mount('/app/groups/g1')
    const notices = () => nodes(mounted.root).filter((node) => node.props['aria-label'] === 'You have unanswered join requests')
    const overview = element(mounted.root, (node) => node.props['data-panel'] === 'stats')
    const members = element(mounted.root, (node) => node.props['data-panel'] === 'members')
    expect(notices()).toHaveLength(0)
    expect(content(overview)).not.toContain('Pending request inbox')
    expect(content(members)).toContain('Pending request inbox')
    expect(members.props.class).toContain('hidden')
    inboxCount.value = 2
    await flush()
    const notice = notices()[0]!
    const header = element(mounted.root, (node) => node.tag === 'header')
    const tabs = element(mounted.root, (node) => node.props['data-active'] !== undefined)
    const all = nodes(mounted.root)
    const leave = element(header, (node) => content(node).trim() === 'Leave group' && node.props.variant === 'outline')
    expect(notice.parent).toBe(leave.parent)
    expect(notice.parent?.children.indexOf(notice)).toBe((leave.parent?.children.indexOf(leave) ?? 0) - 1)
    expect(all.indexOf(notice)).toBeGreaterThan(all.indexOf(element(header, (node) => node.tag === 'h4')))
    expect(all.indexOf(notice)).toBeLessThan(all.indexOf(tabs))
    expect(notice.props.variant).toBe('outline')
    expect(notice.props.size).toBe('sm')
    expect(content(mounted.root)).not.toContain('Group notifications')
    expect(nodes(overview)).not.toContain(notice)
    await click(notice)
    await settled(mounted.router, 'members')
    expect(mounted.router.currentRoute.value.query.tab).toBe('members')
    expect(members.props.class).not.toContain('hidden')
    expect(notices()).toHaveLength(0)
    await click(element(mounted.root, (node) => node.props['data-tab'] === 'stats'))
    await settled(mounted.router, undefined)
    expect(notices()).toHaveLength(1)
    inboxCount.value = 0
    await flush()
    expect(notices()).toHaveLength(0)
    inboxCount.value = null
    inboxError.value = 'Unavailable'
    await flush()
    expect(notices()).toHaveLength(0)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('shows the wait on Leave group, sends it once and frees it when it fails', async () => {
    let refuse: (err: unknown) => void = () => {}
    leaveGroup.mockReturnValueOnce(new Promise<undefined>((_, reject) => (refuse = reject)))
    const mounted = await mount('/app/groups/g1')
    const leave = () => element(mounted.root, (node) => content(node).trim().endsWith('Leave group') && node.props.variant === 'outline')
    void (leave().props.onClick as () => Promise<void>)()
    await flush()
    expect(leave().props['aria-busy']).toBe(true)
    expect(leave().props.disabled).toBe(true)
    expect(content(leave())).toContain('Leaving the group')
    await (leave().props.onClick as () => Promise<void>)()
    expect(leaveGroup).toHaveBeenCalledTimes(1)
    refuse(new Error('last admin'))
    await flush()
    expect(leave().props['aria-busy']).toBe(false)
    expect(leave().props.disabled).toBe(false)
    expect(content(mounted.root)).toContain('last admin')
    mounted.app.unmount()
  })

  it('hides the request box from regular group members', async () => {
    group.value = { display_name: 'Genomics lab', group_id: 'g1', realm_id: REALM, roles: [MEMBER_ROLE] }
    const mounted = await mount('/app/groups/g1')
    expect(nodes(mounted.root).some((node) => node.props['aria-label'] === 'Join requests' || node.props['aria-label'] === 'You have unanswered join requests')).toBe(false)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
