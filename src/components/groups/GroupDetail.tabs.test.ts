import * as VueRuntime from 'vue'
import { defineComponent, h, inject, provide, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as RouteTab from '@/composables/useRouteTab'
import * as Api from '@/lib/api'
import * as Quota from '@/lib/quota'
import * as Utils from '@/lib/utils'

const TAB_NAMES = ['stats', 'members', 'roles', 'sources', 'storage', 'policies']
const REALM = 'realm-1'
const GROUP = {
  display_name: 'Genomics lab',
  group_id: 'g1',
  realm_id: REALM,
  roles: [
    {
      role_id: 'r1',
      name: 'admin',
      permissions: { [`/${REALM}/g/g1/admin/**`]: 'write', [`/${REALM}/g/g1/data/**`]: 'write' },
      assigned_users: ['user-1'],
    },
  ],
}

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

const GroupDetail = compileClientComponent(new URL('./GroupDetail.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/lib/api': Api,
  '@/lib/quota': Quota,
  '@/lib/utils': Utils,
  '@/lib/config': { featureEnabled: () => true },
  '@/composables/useRouteTab': RouteTab,
  '@/composables/useJoinRequests': { useJoinRequests: () => ({ joinRequestsEnabled: ref(false) }) },
  '@/composables/useAruna': {
    useAruna: () => ({
      getGroup: vi.fn(async () => GROUP),
      getGroupUsage: vi.fn(async () => ({ quota: null })),
      getGroupUsageHistory: vi.fn(async () => ({ points: [] })),
      listGroupMembers: vi.fn(async () => ({ members: [] })),
      listGroupMetadata: vi.fn(async () => ({ documents: [] })),
      leaveGroup: vi.fn(async () => undefined),
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
  '@/components/ui/Tabs.vue': moduleDefault(TabsStub),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(TriggerStub),
  '@/components/ui/TabsContent.vue': moduleDefault(PanelStub),
  '@/components/groups/ConnectorsSection.vue': moduleDefault(Empty),
  '@/components/groups/StorageBackendsSection.vue': moduleDefault(Empty),
  '@/components/groups/GroupRoutingSection.vue': moduleDefault(Empty),
  '@/components/groups/GroupMembers.vue': moduleDefault(Empty),
  '@/components/groups/GroupDetailSkeleton.vue': moduleDefault(Empty),
  '@/components/groups/GroupRoles.vue': moduleDefault(Empty),
  '@/components/groups/JoinRequestButton.vue': moduleDefault(Empty),
  '@/components/groups/JoinRequestsInbox.vue': moduleDefault(Empty),
  '@/components/groups/RenameGroupDialog.vue': moduleDefault(Empty),
  '@/components/groups/UsageHistoryChart.vue': moduleDefault(Empty),
  '@/components/policies/PoliciesSection.vue': moduleDefault(Empty),
  '@/components/policies/EffectivePolicies.vue': moduleDefault(Empty),
  '@/components/assistant/AskAiButton.vue': moduleDefault(Empty),
})

async function mount(initial: string) {
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
  const mounted = await mountApp(GroupDetail, { router, props: { groupId: 'g1' } })
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
})
