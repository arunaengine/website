import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as BucketName from '@/lib/bucketName'
import * as BucketPlace from '@/lib/bucketPlace'
import { compileClientComponent, element, moduleDefault, mountApp, type HostNode } from '@/test/clientRender'

// Every child is a named placeholder; the listeners the view passes land on it.
const stub = (name: string) =>
  moduleDefault(defineComponent({ name, setup: () => () => h('div', { 'data-stub': name }) }))

const children = [
  'dashboard/PageHeader',
  'ui/Button',
  'ui/RefreshButton',
  'ui/Input',
  'ui/Dialog',
  'ui/DialogContent',
  'ui/DialogHeader',
  'ui/DialogTitle',
  'ui/DialogDescription',
  'ui/DialogFooter',
  'ui/DialogClose',
  'ui/Notice',
  'data/AddDataDialog',
  'data/DataViewSkeleton',
  'desktop/BindFolderDialog',
  'desktop/NewBucketDialog',
  'data/manager/BucketSidebar',
  'data/NodePicker',
  'data/DeleteDialog',
  'data/FileDetailsDialog',
  'data/PublicAccessDialog',
  'ui/EmptyState',
  'data/manager/MockSidebar',
  'data/DatabaseHeader',
  'data/manager/DistributionBanner',
  'data/manager/ObjectBrowser',
  'data/manager/UploadPanel',
  'notebook/NewNotebookDialog',
]

let manager: Record<string, unknown> = {}

const DataManagerView = compileClientComponent(new URL('./DataManagerView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent(() => () => h('a')) },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  ...Object.fromEntries(
    children.map((path) => [`@/components/${path}.vue`, stub(path.split('/').pop() ?? path)]),
  ),
  '@/composables/useAruna': {
    useAruna: () => ({ bootstrapped: ref(false), currentUser: ref(null), myGroups: ref([]) }),
  },
  '@/composables/useDataManager': { useDataManager: () => manager },
  '@/composables/useBucketDistribution': {
    useBucketDistribution: () => ({ view: ref(null), state: ref('unavailable') }),
  },
  '@/composables/usePageContext': { providePageContext: () => {} },
  '@/composables/useS3': { useS3: () => ({ connectedEndpoint: ref(null) }), s3ErrorMessage: String },
  '@/lib/bucketName': BucketName,
  '@/lib/desktop': { isDesktop: () => true },
  '@/lib/distributedMock': { mockEnabled: () => false },
  '@/lib/distributedMockData': { mockBucket: () => undefined },
  '@/lib/bucketPlace': BucketPlace,
})

// What the view reads at mount; any other field is an empty ref.
function fakeManager(nodeChoice: string | null, needsName = false) {
  const known: Record<string, unknown> = {
    route: { name: 'buckets', query: {} },
    router: { replace: vi.fn(), push: vi.fn() },
    bucket: ref(''),
    s3Prefix: ref(''),
    detailsKey: ref(''),
    references: { entries: ref([]), reload: vi.fn() },
    bucketNodeChoice: ref(nodeChoice),
    bucketList: { refresh: vi.fn() },
    allBuckets: { reload: vi.fn(), needsName: ref(needsName) },
    loadSyncOverview: vi.fn(),
  }
  const empty = new Map<PropertyKey, unknown>()
  return new Proxy(known, {
    get: (target, key) => {
      if (key in target) return target[key as string]
      if (!empty.has(key)) empty.set(key, ref(null))
      return empty.get(key)
    },
  })
}

async function finishLink(nodeChoice: string | null, needsName = false) {
  manager = fakeManager(nodeChoice, needsName)
  const { root, app } = await mountApp(DataManagerView)
  const bind = element(root, (node: HostNode) => node.props['data-stub'] === 'BindFolderDialog')
  await (bind.props.onBound as (folder: unknown) => void)({ folder_id: 'f1' })
  app.unmount()
  return manager as { allBuckets: { reload: () => void }; bucketList: { refresh: () => void } }
}

describe('Data view after a folder link', () => {
  it('reloads the All nodes list it shows', async () => {
    const shown = await finishLink(null)

    expect(shown.allBuckets.reload).toHaveBeenCalled()
    expect(shown.bucketList.refresh).not.toHaveBeenCalled()
  })

  it('reloads the one node list that stands in when the search needs a name', async () => {
    const shown = await finishLink(null, true)

    expect(shown.bucketList.refresh).toHaveBeenCalled()
    expect(shown.allBuckets.reload).not.toHaveBeenCalled()
  })

  it('reloads the one node list when one node is shown', async () => {
    const shown = await finishLink('node-2')

    expect(shown.bucketList.refresh).toHaveBeenCalled()
    expect(shown.allBuckets.reload).not.toHaveBeenCalled()
  })
})
