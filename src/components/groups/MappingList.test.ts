import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketMappings from '@/lib/bucketMappings'
import * as BucketNaming from '@/lib/bucketNaming'
import * as CursorPage from '@/composables/useCursorPage'
import * as Organize from '@/lib/organize'
import * as StorageRules from '@/lib/storageRules'

const previewFileRules = vi.fn()
const previewMove = vi.fn()
const startMove = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { slots }) => () => h('div', [slots.head?.(), slots.default?.()]))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const IconButtonStub = defineComponent({
  props: { label: String },
  setup: (props, { attrs }) => () => h('button', { ...attrs, 'aria-label': props.label }),
})

const MappingList = compileClientComponent(new URL('./MappingList.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/DocsLink.vue': moduleDefault(Empty),
  '@/components/storage/JobProgress.vue': moduleDefault(defineComponent(() => () => h('p', 'job running'))),
  '@/components/storage/PagedList.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
  '@/components/ui/Input.vue': moduleDefault(defineComponent(() => () => h('input'))),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ apiBaseUrl: ref('https://api'), authToken: ref('t'), sessionEpoch: ref(0) }),
  },
  '@/composables/useCursorPage': CursorPage,
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/api': { ...Api, previewFileRules, previewMove, startMove },
  '@/lib/bucketMappings': BucketMappings,
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/organize': Organize,
  '@/lib/storageRules': StorageRules,
})

const LINK = { import_id: 'i1', backend_id: 's1', backend_prefix: 'genes/', bucket: 'genes', key_prefix: '', created_at: '' }
const SAVED = { aruna: 'proteins/{name}', storage: '*.faa' }
const DRAFT = { aruna: 'foobar/{name}', storage: 'lars/{name}' }
type Root = Parameters<typeof content>[0]
const rows = (root: Root) => nodes(root).filter((node) => node.props['data-testid'] === 'mapping')
const buttonIn = (root: Root, text: string) => element(root, (node) => node.tag === 'button' && content(node).trim() === text)

async function mount() {
  const events: string[] = []
  const mounted = await mountApp(
    defineComponent(() => () =>
      h(MappingList, { groupId: 'g1', link: LINK, modelValue: [SAVED, DRAFT], saved: [SAVED], job: null, onStarted: () => events.push('started') }),
    ),
  )
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, events }
}

beforeEach(() => {
  previewFileRules.mockReset().mockResolvedValue({ files: [{ path: 'a/x.faa', key: 'proteins/a/x.faa', outcome: 'matched' }], next: null })
  previewMove.mockReset().mockResolvedValue({ total: 1240, complete: false, items: [] })
  startMove.mockReset().mockResolvedValue({})
})

describe('MappingList', () => {
  it('applies only saved mappings', async () => {
    const { root } = await mount()
    const [saved, draft] = rows(root)
    expect(buttonIn(saved, 'Apply…').props.disabled).toBe(false)
    expect(buttonIn(draft, 'Apply…').props.disabled).toBe(true)
    expect(buttonIn(draft, 'Apply…').props.title).toBe('Save first')
  })

  it('asks with the count before moving and sends the plan of the rule', async () => {
    const { root, events } = await mount()
    await click(buttonIn(rows(root)[0], 'Apply…'))
    expect(content(root)).toContain('at least 1,240 files in Aruna match *.faa in storage and get the Aruna path proteins/{name}.')
    expect(startMove).not.toHaveBeenCalled()
    await click(buttonIn(root, 'Move at least 1,240 files'))
    expect(startMove).toHaveBeenCalledWith(
      'g1',
      'i1',
      { from: '', pattern: '*.faa', target: 'proteins/{dir}{name}', subfolders: true },
      expect.anything(),
    )
    expect(events).toEqual(['started'])
  })

  it('shows an example of the rule as it is typed', async () => {
    const { root } = await mount()
    await click(buttonIn(rows(root)[1], 'Example'))
    await flush()
    expect(previewFileRules).toHaveBeenCalledWith('g1', 'i1', [{ pattern: 'lars/{name}', folder: 'foobar/' }], null, expect.anything())
    expect(content(root)).toContain('proteins/a/x.faa⇆a/x.faa')
  })
})
