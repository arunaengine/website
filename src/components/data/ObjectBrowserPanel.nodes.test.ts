import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Context from '@/composables/s3/context'

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const NodeStub = defineComponent({ props: { nodeId: String }, setup: (props) => () => h('span', `on ${props.nodeId}`) })

const user = ref({ id: 'user-1' })
const context = ref({ userId: 'user-1', nodeId: 'node-1', groupId: 'group-1', session: { accessKeyId: 'k1' } })
const activateContext = vi.fn(async (nodeId: string | null, groupId: string) => {
  context.value = { userId: 'user-1', nodeId: nodeId ?? 'node-1', groupId, session: { accessKeyId: `k-${nodeId}` } }
})
const listObjects = vi.fn(async () => ({ folders: [], objects: [{ key: 'demo.py', name: 'demo.py', size: 4 }] }))
const listBuckets = vi.fn(async () => [{ name: 'local-only' }])
const allBuckets = vi.fn()

const Panel = compileClientComponent(new URL('./ObjectBrowserPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/data/Breadcrumbs.vue': moduleDefault(EmptyStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(EmptyStub),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(EmptyStub),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(EmptyStub),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(EmptyStub),
  '@/components/ui/DropdownMenuLabel.vue': moduleDefault(EmptyStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStub),
  '@/components/ui/NodeLabel.vue': moduleDefault(NodeStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/components/data/ObjectBrowserSkeleton.vue': moduleDefault(EmptyStub),
  '@/components/data/ObjectIcon.vue': moduleDefault(EmptyStub),
  '@/composables/useAllBuckets': {
    useAllBuckets: (...args: unknown[]) => {
      allBuckets(...args)
      return {
        hits: ref([{ bucket: 'mine', node_id: 'node-1' }, { bucket: 'demo', node_id: 'node-2' }]),
        loading: ref(false),
        error: ref(null),
        more: ref(false),
        needsName: ref(false),
        loadMore: vi.fn(),
      }
    },
  },
  '@/composables/useAruna': { useAruna: () => ({ currentUser: user, myGroups: ref([{ id: 'group-1', name: 'Lab' }]) }) },
  '@/composables/useGroupSelection': { useGroupSelection: () => ({ groupsLoading: ref(false), hasGroups: ref(true) }) },
  '@/composables/useS3': {
    useS3: () => ({
      activeContext: context,
      activeKey: computed(() => context.value.session),
      endpointForNode: (nodeId: string | null) => `https://s3.${nodeId ?? 'node-1'}.test`,
      nodeIdFor: (nodeId: string | null) => nodeId ?? 'node-1',
      activateContext,
      listBuckets,
      listObjects,
    }),
    s3ErrorMessage: String,
    isS3AuthError: () => false,
    isS3NetworkError: () => false,
  },
  '@/composables/s3/context': Context,
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ displayName: (id: string) => id, isLocalNode: (id: string) => id === 'node-1' }),
  },
  '@/composables/useStagingReferences': {
    useStagingReferences: () => ({ prefixHasReferences: () => false, keyIsReferenced: () => false }),
  },
  '@/lib/utils': { formatBytes: String, relativeTime: String },
  '@/lib/workspaces': { isHiddenBucket: () => false },
})

describe('ObjectBrowserPanel on every node', () => {
  it('lists the buckets of every node and opens a picked one on its node', async () => {
    const picks: Array<{ bucket: string; key: string; nodeId: string | null }> = []
    const mounted = await mountApp(Panel, { props: { allNodes: true, groupId: 'group-1', onSelect: (entry: never) => picks.push(entry) } })
    await flush()

    expect(listBuckets).not.toHaveBeenCalled()
    await click(button(mounted.root, 'demoon node-2'))
    await flush()
    expect(activateContext).toHaveBeenLastCalledWith('node-2', 'group-1')
    expect(listObjects).toHaveBeenLastCalledWith('demo', '', undefined, 'node-2')

    await click(element(mounted.root, (node) => node.tag === 'tr' && content(node).includes('demo.py')))
    expect(picks).toEqual([{ bucket: 'demo', key: 'demo.py', name: 'demo.py', size: 4, nodeId: 'node-2' }])
    mounted.app.unmount()
  })
})
