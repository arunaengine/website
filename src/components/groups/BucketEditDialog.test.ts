import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref, type Component } from 'vue'
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
const begin = vi.fn()
const savesInFlight = reactive(new Set<string>())
const status = ref<{ files?: number; conflicts: [] } | null>(null)
const renames = ref<{ count: number; complete: boolean; files: [] } | null>(null)

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
    savesInFlight,
    useLinkState: () => ({
      renames,
      status,
      job: ref(null),
      error: ref(null),
      controlling: ref(false),
      finished: ref(0),
      lastJob: ref(null),
      refresh,
      begin,
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
const saveButton = (root: Root) =>
  element(root, (node) => node.tag === 'button' && ['Save', 'Saving…'].includes(content(node).trim()))

async function mount() {
  const open = ref(false)
  const shown = ref(true)
  const mounted = await mountApp(
    defineComponent(() => () =>
      shown.value
        ? h(BucketEditDialog, { open: open.value, groupId: 'g1', link: LINK, storage: 'spire', place: 'aruna-spire-genes' })
        : null,
    ),
  )
  open.value = true
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, open, shown }
}

async function checkRename(root: Root) {
  const box = element(root, (node) => node.tag === 'input' && node.props.type === 'checkbox')
  ;(box as unknown as { checked: boolean }).checked = true
  for (const listener of box.listeners.get('change') ?? []) listener({ target: box })
  await flush()
}

beforeEach(() => {
  savesInFlight.clear()
  status.value = null
  renames.value = null
  getFileRules.mockReset().mockResolvedValue({ rules: [] })
  updateBackendImport.mockReset().mockResolvedValue({})
  startImportRenames.mockReset().mockResolvedValue({})
  refresh.mockReset()
  begin.mockReset()
})

describe('BucketEditDialog', () => {
  it('saves a new naming and renames the files of the old style', async () => {
    const { root } = await mount()
    expect(content(root)).toContain('Example: 01JA7Q3K_b.fa.gz')
    expect(saveButton(root).props.disabled).toBe(true)

    await typeValue(field(root, 'New uploads are named'), 'suffix')
    expect(content(root)).toContain('After saving: b.fa.gz~01JA7Q3K')
    expect(content(root)).toContain('Also rename existing files to the new style (counted after saving)')
    await checkRename(root)
    await click(saveButton(root))

    expect(updateBackendImport).toHaveBeenCalledWith('g1', 'i1', null, expect.anything(), '{dir}{name}~{id}')
    expect(startImportRenames).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    // The rename shows as running at once, not after the next plan read.
    expect(begin).toHaveBeenCalledWith(null)
    // Only the read at opening; the save asks for no further one.
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps a schedule changed while a save runs as unsaved', async () => {
    let answer: (value: unknown) => void = () => {}
    updateBackendImport.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { root } = await mount()
    await typeValue(field(root, 'Look for new files'), '0 3 * * *')
    const pending = (saveButton(root).props.onClick as () => Promise<void>)()
    await flush()
    await typeValue(field(root, 'Look for new files'), '0 3 * * 1')
    answer({})
    await pending
    await flush()
    expect(updateBackendImport).toHaveBeenCalledWith('g1', 'i1', '0 3 * * *', expect.anything(), undefined)
    expect(saveButton(root).props.disabled).toBe(false)
  })

  it('lets a new opening save only after the earlier save of the bucket ended', async () => {
    let answer: (value: unknown) => void = () => {}
    updateBackendImport.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { root, open } = await mount()
    await typeValue(field(root, 'Look for new files'), '0 3 * * *')
    void (saveButton(root).props.onClick as () => Promise<void>)()
    await flush()
    open.value = false
    await flush()
    open.value = true
    await flush()
    await typeValue(field(root, 'Look for new files'), '0 3 * * 1')
    expect(content(saveButton(root)).trim()).toBe('Saving…')
    expect(saveButton(root).props.disabled).toBe(true)
    answer({})
    await flush()
    expect(content(saveButton(root)).trim()).toBe('Save')
    expect(saveButton(root).props.disabled).toBe(false)
  })

  it('starts no rename after the dialog closed during a save', async () => {
    let answer: (value: unknown) => void = () => {}
    updateBackendImport.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { root, shown } = await mount()
    await typeValue(field(root, 'New uploads are named'), 'suffix')
    await checkRename(root)
    void (saveButton(root).props.onClick as () => Promise<void>)()
    await flush()
    shown.value = false
    await flush()
    answer({})
    await flush()
    expect(updateBackendImport).toHaveBeenCalled()
    expect(startImportRenames).not.toHaveBeenCalled()
    expect(savesInFlight.size).toBe(0)
  })

  it('counts the files of an older style before saving', async () => {
    renames.value = { count: 6, complete: true, files: [] }
    const { root } = await mount()
    await typeValue(field(root, 'New uploads are named'), 'plain')
    expect(content(root)).toContain('Also rename at least 6 files to the new style')
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
