import * as VueRuntime from 'vue'
import { defineComponent, h, ref, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketMappings from '@/lib/bucketMappings'
import * as BucketNaming from '@/lib/bucketNaming'
import * as Organize from '@/lib/organize'
import * as Utils from '@/lib/utils'

const getFileRules = vi.fn()
const saveFileRules = vi.fn()
const startImportRenames = vi.fn()
const updateBackendImport = vi.fn()
const refresh = vi.fn()
const status = ref<{ files?: number; conflicts: [] } | null>(null)

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('select', { 'aria-label': props.ariaLabel, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})

const ui = (name: string, component: Component = Slot) => ({ [`@/components/ui/${name}.vue`]: moduleDefault(component) })
const BucketEditDialog = compileClientComponent(new URL('./BucketEditDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/groups/BucketOrganize.vue': moduleDefault(Empty),
  '@/components/groups/MappingList.vue': moduleDefault(Empty),
  '@/components/storage/JobProgress.vue': moduleDefault(Empty),
  ...ui('Button', ButtonStub),
  ...ui('Dialog'),
  ...ui('DialogClose'),
  ...ui('DialogContent'),
  ...ui('DialogDescription'),
  ...ui('DialogHeader'),
  ...ui('DialogTitle'),
  ...ui('Input', InputStub),
  ...ui('Notice'),
  ...ui('Select', SelectStub),
  ...ui('Tabs'),
  ...ui('TabsContent'),
  ...ui('TabsList'),
  ...ui('TabsTrigger'),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://api'), authToken: ref('t'), sessionEpoch: ref(0) }) },
  '@/composables/useLinkState': {
    useLinkState: () => ({
      renames: ref(null),
      status,
      job: ref(null),
      error: ref(null),
      controlling: ref(false),
      finished: ref(0),
      refresh,
      control: vi.fn(),
    }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/api': { ...Api, getFileRules, saveFileRules, startImportRenames, updateBackendImport },
  '@/lib/bucketMappings': BucketMappings,
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/organize': Organize,
  '@/lib/utils': Utils,
})

const LINK = {
  import_id: 'i1',
  backend_id: 's1',
  backend_prefix: 'aruna-spire-genes/',
  bucket: 'genes',
  key_prefix: '',
  write_pattern: '{dir}{id}_{name}',
  created_at: '',
}
type Root = Parameters<typeof content>[0]
const field = (root: Root, label: string) => element(root, (node) => node.props['aria-label'] === label)
const saveButton = (root: Root) => element(root, (node) => node.tag === 'button' && content(node).trim() === 'Save')

async function mount() {
  const open = ref(false)
  const mounted = await mountApp(
    defineComponent(() => () =>
      h(BucketEditDialog, { open: open.value, groupId: 'g1', link: LINK, storage: 'spire', place: 'aruna-spire-genes' }),
    ),
  )
  open.value = true
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

beforeEach(() => {
  status.value = null
  getFileRules.mockReset().mockResolvedValue({ rules: [] })
  updateBackendImport.mockReset().mockResolvedValue({})
  startImportRenames.mockReset().mockResolvedValue({})
  refresh.mockReset()
})

describe('BucketEditDialog', () => {
  it('saves a new naming and renames the files of the old style', async () => {
    const { root } = await mount()
    expect(content(root)).toContain('Example: 01JA7Q3K_b.fa.gz')
    expect(saveButton(root).props.disabled).toBe(true)

    await typeValue(field(root, 'New uploads are named'), 'suffix')
    expect(content(root)).toContain('After saving: b.fa.gz~01JA7Q3K')
    expect(content(root)).toContain('Also rename the files that use the old style')
    await click(saveButton(root))

    expect(updateBackendImport).toHaveBeenCalledWith('g1', 'i1', null, expect.anything(), '{dir}{name}~{id}')
    expect(startImportRenames).toHaveBeenCalledWith('g1', 'i1', expect.anything())
  })

  it('refuses a custom name without {name}', async () => {
    const { root } = await mount()
    await typeValue(field(root, 'New uploads are named'), 'custom')
    await typeValue(field(root, 'Custom name'), 'raw/{id}')
    expect(content(root)).toContain('The name needs {name}.')
    expect(saveButton(root).props.disabled).toBe(true)
  })

  it('warns about hourly syncs only on a big bucket', async () => {
    status.value = { files: 300_997, conflicts: [] }
    const { root } = await mount()
    expect(content(root)).not.toContain('Hourly syncs')
    await typeValue(field(root, 'Look for new files'), '0 * * * *')
    expect(content(root)).toContain('Hourly syncs of 300,997 files cause steady S3 traffic.')
  })
})
