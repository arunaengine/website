import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as Utils from '@/lib/utils'

const createBackendImport = vi.fn()
const updateBackendImport = vi.fn()
const runBackendImport = vi.fn()
const onSaved = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

const LinkedFolderDialog = compileClientComponent(new URL('./LinkedFolderDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Select.vue': moduleDefault(defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs }) => () => h('select', attrs),
  })),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/composables/useBuckets': {
    useBuckets: () => ({ buckets: ref([{ name: 'sequencing' }]), ensure: vi.fn() }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/api': { ...Api, createBackendImport, updateBackendImport, runBackendImport },
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/utils': Utils,
})

const BACKENDS = [
  { backend_id: 'b1', group_id: 'g1', kind: 's3', name: 'lab-store', public_config: { bucket: 'lab', endpoint: 'https://s3.lab.example' } },
]
const STORED = {
  import_id: 'i1', backend_id: 'b1', backend_prefix: 'raw/2024/', bucket: 'sequencing', key_prefix: 'seq/',
  write_pattern: '{dir}{id}_{name}', schedule: null, created_at: '',
}

type Root = Parameters<typeof content>[0]

async function mount(link: unknown = null) {
  const state = reactive({ open: false, groupId: 'g1', backends: BACKENDS, link, onSaved })
  const mounted = await mountApp(defineComponent(() => () => h(LinkedFolderDialog, state)))
  state.open = true
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

async function choose(root: Root, label: string, value: string) {
  const select = element(root, (node) => node.tag === 'select' && node.props['aria-label'] === label)
  ;(select.props['onUpdate:modelValue'] as (v: string) => void)(value)
  await flush()
}

function inputById(root: Root, suffix: string) {
  return element(root, (node) => node.tag === 'input' && String(node.props.id).endsWith(suffix))
}

async function submit(root: Root) {
  const form = element(root, (node) => node.tag === 'form')
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
  await flush()
}

beforeEach(() => {
  createBackendImport.mockReset()
  updateBackendImport.mockReset()
  runBackendImport.mockReset()
  onSaved.mockReset()
})

describe('LinkedFolderDialog', () => {
  it('links, starts the first run and shows both directions', async () => {
    createBackendImport.mockResolvedValue({ ...STORED, import_id: 'new' })
    runBackendImport.mockRejectedValue(new Api.ApiError(409, 'already running'))
    const mounted = await mount()
    expect(content(mounted.root)).toContain('S3 bucket lab at https://s3.lab.example')
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    await typeValue(inputById(mounted.root, '-source-folder'), '/raw/2024')
    await typeValue(inputById(mounted.root, '-bucket-folder'), 'seq')
    await choose(mounted.root, 'Look for new files', '0 3 * * *')

    const text = content(mounted.root)
    expect(text).toContain('lab / raw/2024/run1/a.fastq')
    expect(text).toContain('sequencing / seq/run1/a.fastq')
    expect(text).toContain('Uploads to sequencing / seq')
    expect(text).toContain('(lab / raw/2024)')
    expect(text).toContain('lab / raw/2024/run2/01JA7Q3K_b.fastq')
    await submit(mounted.root)

    expect(createBackendImport).toHaveBeenCalledWith(
      'g1',
      {
        backend_id: 'b1', backend_prefix: 'raw/2024/', bucket: 'sequencing', key_prefix: 'seq/',
        write_pattern: '{dir}{id}_{name}', schedule: '0 3 * * *',
      },
      expect.anything(),
    )
    expect(runBackendImport).toHaveBeenCalledWith('g1', 'new', expect.anything())
    expect(onSaved).toHaveBeenCalledWith(undefined)
    mounted.app.unmount()
  })

  it('links whole stores when both folders stay empty', async () => {
    createBackendImport.mockResolvedValue({ ...STORED, import_id: 'new' })
    runBackendImport.mockResolvedValue({ job_id: 'j1' })
    const mounted = await mount()
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')

    const text = content(mounted.root)
    expect(text).toContain('Leave empty to use all files in S3 bucket lab.')
    expect(text).toContain('Leave empty to place files at the top of sequencing.')
    expect(text).toContain('appears in Aruna as sequencing / run1/a.fastq')
    await submit(mounted.root)

    expect(createBackendImport).toHaveBeenCalledWith(
      'g1',
      { backend_id: 'b1', backend_prefix: '', bucket: 'sequencing', key_prefix: '', write_pattern: '{dir}{id}_{name}' },
      expect.anything(),
    )
    mounted.app.unmount()
  })

  it('refuses a file name without {name} or with an unknown placeholder', async () => {
    const mounted = await mount()
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(true)
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(false)

    await typeValue(inputById(mounted.root, '-pattern'), '{dir}{id}')
    expect(content(mounted.root)).toContain('The file name needs {name}.')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(true)
    await typeValue(inputById(mounted.root, '-pattern'), '{dir}{date}_{name}')
    expect(content(mounted.root)).toContain('Unknown placeholder {date}')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('changes only the schedule of a stored link', async () => {
    updateBackendImport.mockResolvedValue(STORED)
    const mounted = await mount(STORED)
    expect(button(mounted.root, 'Save changes').props.disabled).toBe(true)
    await choose(mounted.root, 'Look for new files', '0 * * * *')
    await submit(mounted.root)

    expect(updateBackendImport).toHaveBeenCalledWith('g1', 'i1', '0 * * * *', expect.anything())
    expect(createBackendImport).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('shows a refusal of the node in the dialog', async () => {
    createBackendImport.mockRejectedValue(new Api.ApiError(409, 'Another link already uses this folder.'))
    const mounted = await mount()
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    await submit(mounted.root)

    expect(content(mounted.root)).toContain('Another link already uses this folder.')
    expect(onSaved).not.toHaveBeenCalled()
    mounted.app.unmount()
  })
})
