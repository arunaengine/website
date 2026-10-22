import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketNaming from '@/lib/bucketNaming'
import * as CursorPage from '@/composables/useCursorPage'
import * as Organize from '@/lib/organize'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const previewDuplicates = vi.fn()
const startDuplicates = vi.fn()
const getImportRenames = vi.fn()
const startImportRenames = vi.fn()

const Slot = defineComponent((_, { slots }) => () => h('div', [slots.head?.(), slots.default?.()]))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const BucketOrganize = compileClientComponent(new URL('./BucketOrganize.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/storage/JobProgress.vue': moduleDefault(defineComponent(() => () => h('p', 'job running'))),
  '@/components/storage/PagedList.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ apiBaseUrl: ref('https://api'), authToken: ref('t'), sessionEpoch: ref(0) }),
  },
  '@/composables/useCursorPage': CursorPage,
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/api': { ...Api, previewDuplicates, startDuplicates, getImportRenames, startImportRenames },
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/organize': Organize,
  '@/lib/storageRules': StorageRules,
  '@/lib/utils': Utils,
})

const LINK = { import_id: 'i1', backend_id: 's1', backend_prefix: 'genes/', bucket: 'genes', key_prefix: '', created_at: '' }
const COPY = { key: 'a.faa', kept: { path: 'a.faa', bytes: 1 }, removed: [{ path: '01M5_a.faa', bytes: 1 }] }
type Root = Parameters<typeof content>[0]
const buttonIn = (root: Root, text: string) => element(root, (node) => node.tag === 'button' && content(node).trim() === text)
const step = (root: Root, id: string) => nodes(root).filter((node) => node.props['data-testid'] === id)

async function mount(renames: unknown) {
  const mounted = await mountApp(
    defineComponent(() => () => h(BucketOrganize, { groupId: 'g1', link: LINK, place: 'aruna-spire-genes', renames, job: null })),
  )
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

beforeEach(() => {
  previewDuplicates.mockReset().mockResolvedValue({ total: 6, bytes: 6, complete: true, items: [COPY], next: null })
  startDuplicates.mockReset().mockResolvedValue({})
  getImportRenames.mockReset().mockResolvedValue({ count: 0, complete: true, files: [] })
  startImportRenames.mockReset().mockResolvedValue({})
})

describe('BucketOrganize', () => {
  it('says so when there is nothing to clean up', async () => {
    previewDuplicates.mockResolvedValue({ total: 0, bytes: 0, complete: true, items: [] })
    const { root } = await mount({ count: 0, complete: true, files: [] })
    expect(content(root)).toContain('Nothing to clean up.')
    expect(step(root, 'step-duplicates')).toHaveLength(0)
    expect(step(root, 'step-renames')).toHaveLength(0)
  })

  it('shows only steps with work, with a partial count as at least', async () => {
    const { root } = await mount({ count: 3, complete: false, files: [] })
    expect(content(step(root, 'step-duplicates')[0])).toContain('6 files')
    expect(content(step(root, 'step-renames')[0])).toContain('at least 3 files')
    expect(content(root)).not.toContain('Nothing to clean up.')
  })

  it('deletes copies only after the review is confirmed', async () => {
    const { root } = await mount({ count: 0, complete: true, files: [] })
    await click(buttonIn(step(root, 'step-duplicates')[0], 'Review…'))
    expect(content(root)).toContain('01M5_a.faa')
    expect(startDuplicates).not.toHaveBeenCalled()
    await click(buttonIn(root, 'Delete 6 copies'))
    expect(startDuplicates).toHaveBeenCalledWith('g1', 'i1', expect.anything())
  })
})
