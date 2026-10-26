import { computed, defineComponent, h, inject, provide, reactive, ref, type ComputedRef } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Distribution from '@/lib/distribution'
import * as GroupAdmin from '@/lib/groupAdmin'
import type { GroupDetailResponse } from '@/lib/api'
import { compileClientComponent, content, flush, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const route = reactive<{ params: Record<string, string>; query: Record<string, string> }>({
  params: { bucketId: 'reef-survey' },
  query: {},
})

function groupDetail(admin: boolean): GroupDetailResponse {
  return {
    display_name: 'Reef survey',
    group_id: 'g-1',
    realm_id: 'r-1',
    roles: admin
      ? [
          {
            role_id: 'role-1',
            name: 'Admins',
            permissions: { '/r-1/g/g-1/admin/**': 'write' },
            assigned_users: ['u-1'],
          },
        ]
      : [],
  }
}

const isRealmAdmin = ref(false)
// The set the node reports for the open bucket; null for an ordinary bucket.
const setView = ref<unknown>(null)
const setState = ref('ordinary')
const setError = ref<string | null>(null)
const group = ref<GroupDetailResponse>(groupDetail(false))

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () =>
    h('header', [h('h1', props.title), slots.breadcrumbs?.(), slots.actions?.()]),
})
const TabsStub = defineComponent({
  props: { modelValue: String },
  setup(props, { slots }) {
    provide('active-tab', computed(() => props.modelValue))
    return () => h('div', slots.default?.())
  },
})
const TabsContentStub = defineComponent({
  props: { value: String },
  setup(props, { slots }) {
    const active = inject<ComputedRef<string>>('active-tab')
    return () => (active?.value === props.value ? h('div', slots.default?.()) : null)
  },
})
const TabsTriggerStub = defineComponent({
  props: { value: String },
  setup: (props, { slots }) => () => h('button', { 'data-tab': props.value }, slots.default?.()),
})
const Marker = (text: string) => defineComponent({ setup: () => () => h('section', text) })

const view = compileClientComponent(new URL('./BucketStorageView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a'), useRoute: () => route },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Tabs.vue': moduleDefault(TabsStub),
  '@/components/ui/TabsContent.vue': moduleDefault(TabsContentStub),
  '@/components/ui/TabsList.vue': moduleDefault(Slotted('div')),
  '@/components/ui/TabsTrigger.vue': moduleDefault(TabsTriggerStub),
  '@/components/storage/BucketAccessTab.vue': moduleDefault(Marker('public rules')),
  '@/components/distributed/AccessTab.vue': moduleDefault(Marker('grants on nodes')),
  '@/components/storage/DistributionOverview.vue': moduleDefault(Marker('stored on')),
  '@/components/storage/BucketSources.vue': moduleDefault(Marker('sources of files')),
  '@/components/storage/SetDeleteSection.vue': moduleDefault(Marker('deleting a bucket on more nodes')),
  '@/components/storage/DatabaseSettings.vue': moduleDefault(Marker('database settings')),
  '@/components/data/LinkedDatasets.vue': moduleDefault(Marker('datasets that link this bucket')),
  '@/components/distributed/GrantGuide.vue': moduleDefault(Marker('grant on every node')),
  '@/components/storage/BucketNodesTab.vue': moduleDefault(Marker('nodes of the bucket')),
  '@/components/storage/FileSources.vue': moduleDefault(Marker('file sources')),
  '@/components/storage/DatabaseMark.vue': moduleDefault(Marker('database mark')),
  '@/components/storage/LinkedBy.vue': moduleDefault(Marker('linked by datasets')),
  '@/components/storage/CopiesOfBucket.vue': moduleDefault(Marker('copies of this bucket')),
  '@/lib/distributedMock': { mockEnabled: () => false },
  '@/lib/distributedMockData': { mockBucket: () => undefined },
  '@/composables/useBucketDistribution': {
    useBucketDistribution: () => ({ view: setView, state: setState, error: setError, reload: () => undefined }),
  },
  '@/components/storage/BucketBackendTab.vue': moduleDefault(Marker('backend rules')),
  '@/components/storage/BucketDeleteSection.vue': moduleDefault(Marker('bucket deletion')),
  '@/components/storage/BucketComplianceSection.vue': moduleDefault(Marker('compliance on this node')),
  '@/components/storage/BucketEncryptionTab.vue': moduleDefault(Marker('encryption state')),
  '@/components/storage/BucketPolicySection.vue': moduleDefault(Marker('where copies may be stored')),
  '@/components/storage/StorageOverviewTab.vue': moduleDefault(Marker('overview details')),
  '@/components/storage/TransfersTab.vue': moduleDefault(Marker('transfer rows')),
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: (key: string) => !hiddenFeatures.has(key) }) },
  '@/composables/useAruna': {
    useAruna: () => ({
      currentUser: ref({ id: 'u-1' }),
      getGroup: () => Promise.resolve(group.value),
      isRealmAdmin,
    }),
  },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'node-local', displayName: () => 'Node B' }),
  },
  '@/composables/useRouteTab': {
    useRouteTab: (allowed: readonly string[], fallback: string) =>
      computed({
        get: () => (allowed.includes(route.query.tab ?? '') ? route.query.tab : fallback),
        set: (next: string) => {
          route.query = next === fallback ? {} : { tab: next }
        },
      }),
  },
  '@/composables/useS3': { useS3: () => ({ activeContext: ref({ groupId: 'g-1' }) }) },
  '@/lib/distribution': Distribution,
  '@/lib/groupAdmin': GroupAdmin,
})

const hiddenFeatures = new Set<string>()

async function render(options: { admin?: boolean; realmAdmin?: boolean; stored?: unknown; query?: Record<string, string> } = {}) {
  setView.value = options.stored ?? null
  setState.value = options.stored ? 'ready' : 'ordinary'
  setError.value = null
  group.value = groupDetail(options.admin ?? false)
  isRealmAdmin.value = options.realmAdmin ?? false
  route.query = options.query ?? {}
  const { root } = await mountApp(view)
  return root
}

function tabs(root: Awaited<ReturnType<typeof render>>): string[] {
  const found: string[] = []
  const walk = (node: { props: Record<string, unknown>; children: unknown[] }) => {
    if (typeof node.props['data-tab'] === 'string') found.push(node.props['data-tab'] as string)
    for (const child of node.children as typeof node[]) walk(child)
  }
  walk(root as never)
  return found
}

function tabLabels(root: Awaited<ReturnType<typeof render>>): string[] {
  return nodes(root as never)
    .filter((node) => typeof node.props['data-tab'] === 'string')
    .map((node) => content(node).trim())
}

describe('bucket storage page', () => {
  it('keeps the policy tabs from a reader', async () => {
    const root = await render()

    expect(content(root)).toContain('Settings for reef-survey')
    expect(tabs(root)).toEqual(['overview', 'access', 'encryption', 'transfers'])
    expect(content(root)).toContain('overview details')
  })

  it('opens the tab named in the query', async () => {
    expect(content(await render({ query: { tab: 'transfers' } }))).toContain('transfer rows')
    expect(content(await render({ query: { tab: 'encryption' } }))).toContain('encryption state')
    expect(content(await render({ admin: true, query: { tab: 'backend' } }))).toContain('backend rules')
  })

  it('falls back to the overview when the query names a tab this viewer lacks', async () => {
    const root = await render({ query: { tab: 'placement' } })

    expect(content(root)).toContain('overview details')
    expect(content(root)).not.toContain('where copies may be stored')
  })

  it('offers the backend and placement tabs to a group admin', async () => {
    const root = await render({ admin: true, query: { tab: 'placement' } })

    expect(tabs(root)).toEqual(['overview', 'backend', 'placement', 'access', 'encryption', 'transfers'])
    expect(content(root)).toContain('where copies may be stored')
    expect(content(root)).toContain('compliance on this node')
  })

  it('opens a deep-linked placement tab whose trigger the user hid', async () => {
    hiddenFeatures.add('placement')
    const root = await render({ admin: true, query: { tab: 'placement' } })
    hiddenFeatures.clear()

    expect(tabs(root)).not.toContain('placement')
    expect(content(root)).toContain('where copies may be stored')
  })

  it('offers a realm admin placement but not the group routing rules', async () => {
    const root = await render({ realmAdmin: true, query: { tab: 'placement' } })

    expect(tabs(root)).toEqual(['overview', 'placement', 'access', 'encryption', 'transfers'])
    expect(content(root)).toContain('where copies may be stored')
  })

  it('names every section the way the settings page calls it', async () => {
    const root = await render({ admin: true })

    expect(tabLabels(root)).toEqual(['Overview', 'Storage backend', 'Placement', 'Access', 'Encryption', 'Transfers'])
  })

  it('ends the overview with the bucket deletion and opens the access tab', async () => {
    expect(content(await render({ admin: true }))).toContain('bucket deletion')
    expect(content(await render({ query: { tab: 'access' } }))).toContain('public rules')
  })

  it('hides the node-local tabs for a bucket hosted elsewhere', async () => {
    const root = await render({ admin: true, realmAdmin: true, query: { node: 'node-far', tab: 'transfers' } })

    expect(tabs(root)).toEqual(['overview', 'access', 'encryption', 'transfers'])
    expect(content(root)).toContain('transfer rows')
  })

  it('adds the nodes tab and the grant guide for a bucket the node reports on several nodes', async () => {
    const stored = { name: 'reef-survey', members: [{ nodeId: 'a' }, { nodeId: 'b' }], ranges: [], live: { recommendedGrant: '/r/g/g-1/data/*/reef-survey/**' } }

    const root = await render({ stored })
    expect(tabs(root)).toEqual(['overview', 'nodes', 'access', 'encryption', 'transfers'])
    expect(content(root)).toContain('stored on')
    expect(content(root)).toContain('deleting a bucket on more nodes')
    expect(content(root)).not.toContain('bucket deletion')
    expect(content(await render({ stored, query: { tab: 'nodes' } }))).toContain('nodes of the bucket')
    expect(content(await render({ stored, query: { tab: 'access' } }))).toContain('grant on every node')
  })

  it('offers no ordinary deletion while the storage is loading or unreadable, and says why', async () => {
    const root = await render({ admin: true })
    setState.value = 'loading'
    await flush()
    expect(content(root)).not.toContain('bucket deletion')

    setState.value = 'unavailable'
    setError.value = 'node busy'
    await flush()
    expect(content(root)).toContain('How this bucket is stored could not be read: node busy')
    expect(content(root)).not.toContain('bucket deletion')
  })

  it('shows the database section on the overview', async () => {
    expect(content(await render())).toContain('database settings')
  })

  it('keeps an ordinary bucket without the nodes tab', async () => {
    expect(tabs(await render())).not.toContain('nodes')
  })
})
