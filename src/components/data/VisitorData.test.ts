import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const route = { params: { bucketId: 'refseq' } as Record<string, string>, query: { node: 'n2' } as Record<string, string>, fullPath: '/app/buckets/refseq?node=n2' }
const buckets = ref([{ bucket: 'refseq', node_id: 'n2', set_id: 's1', nodes: ['n2', 'n3'], group_id: 'g', arn: '', created_at: '' }])
const folder = {
  folders: ref([{ prefix: 'GCF_1/', name: 'GCF_1' }]),
  files: ref([{ key: 'README.md', name: 'README.md', size: 12, lastModified: null, contentType: null, versionId: 'v1' }]),
  loading: ref(false),
  error: ref<string | null>(null),
  denied: ref(false),
  page: ref(1),
  nextCursor: ref<string | null>(null),
  nextPage: vi.fn(),
  previousPage: vi.fn(),
}
const folderArgs: unknown[][] = []
const failedNodes = ref(0)
const s3Url = 'https://s3.n2.test'

const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const Named = (name: string) => defineComponent((_, { attrs }) => () => h('span', `${name} ${String(attrs.bucket ?? attrs.title ?? '')}`))

let VisitorData: ReturnType<typeof defineComponent>

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: vi.fn() }), RouterLink: Pass }))
  vi.doMock('@/composables/useAruna', () => ({
    useAruna: () => ({ getNodeInfo: async () => ({ services: { interfaces: { s3: { url: s3Url } } } }), nodeInfo: ref(null) }),
  }))
  vi.doMock('@/composables/useAuth', () => ({ useAuth: () => ({ signIn: vi.fn() }) }))
  vi.doMock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'n1', displayName: (id: string) => id }) }))
  vi.doMock('@/composables/useBucketUsage', () => ({ useListedUsage: () => ({ ensure: vi.fn(), partsOf: () => null, textOf: () => null }), usageText: () => '' }))
  vi.doMock('@/composables/usePublicData', async (original) => ({
    ...(await original<typeof import('@/composables/usePublicData')>()),
    usePublicBuckets: () => ({ buckets, loading: ref(false), error: ref(null), failedNodes, reload: vi.fn() }),
    usePublicFolder: (...args: unknown[]) => {
      folderArgs.push(args)
      return folder
    },
  }))
  vi.doMock('@/components/data/BucketRow.vue', () => ({ default: Named('row') }))
  vi.doMock('@/components/data/DatabaseHeader.vue', () => ({ default: Named('header') }))
  vi.doMock('@/components/data/Breadcrumbs.vue', () => ({ default: Named('crumbs') }))
  vi.doMock('@/components/data/VisitorFileDialog.vue', () => ({ default: Pass }))
  vi.doMock('@/components/ui/Tooltip.vue', () => ({ default: Pass }))
  vi.doMock('@/components/ui/Select.vue', () => ({ default: Pass }))
  VisitorData = (await import('./VisitorData.vue')).default
})

beforeEach(() => {
  folder.denied.value = false
  folder.error.value = null
  folderArgs.length = 0
  failedNodes.value = 0
})

async function render(): Promise<string> {
  const html = await renderToString(createSSRApp(VisitorData))
  await new Promise((resolve) => setTimeout(resolve, 0))
  return html
}

describe('VisitorData', () => {
  it('lists the public buckets and the open folder on the node the address names', async () => {
    const html = await render()
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('Public buckets')
    expect(text).toContain('row refseq')
    expect(text).toContain('GCF_1')
    expect(text).toContain('README.md')
    const [bucket, prefix, node] = folderArgs[0] as [{ value: string }, { value: string }, { value: string | null }]
    expect([bucket.value, prefix.value, node.value]).toEqual(['refseq', '', 'n2'])
  })

  it('offers no action that changes data', async () => {
    const text = (await render()).replace(/<[^>]+>/g, ' ')
    for (const word of ['Upload', 'New folder', 'New bucket', 'Delete', 'Share', 'Settings', 'type="checkbox"']) {
      expect(text).not.toContain(word)
    }
  })

  it('says the public list is incomplete when nodes did not answer', async () => {
    const all = buckets.value
    buckets.value = []
    failedNodes.value = 2
    const text = (await render()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    buckets.value = all
    expect(text).toContain('2 nodes did not answer. Retry')
    expect(text).not.toContain('This realm has no public buckets.')
  })

  it('says a refused bucket is not public and offers sign in', async () => {
    folder.denied.value = true
    const text = (await render()).replace(/<[^>]+>/g, ' ')
    expect(text).toContain('This bucket is not public.')
    expect(text).toContain('Sign in')
    expect(text).not.toContain('README.md')
  })
})

