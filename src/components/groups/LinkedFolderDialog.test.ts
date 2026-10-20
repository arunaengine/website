import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const createBackendImport = vi.fn()
const updateBackendImport = vi.fn()
const startBucketMove = vi.fn()
const runBackendImport = vi.fn()
// The shared live check runs for real; only its request is a stand-in.
const { checkProviderBucket } = vi.hoisted(() => ({ checkProviderBucket: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), checkProviderBucket }))
vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return { useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer') }) }
})
const BucketCheck = await import('@/composables/useBucketCheck')
const onSaved = vi.fn()
const onOpen = vi.fn()
const activeContext = ref({ nodeId: 'n1', groupId: 'g1' })

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () => h('button', { ...attrs, onClick: () => emit('update:checked', !props.checked) }),
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
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/composables/useBuckets': {
    useBuckets: () => ({ buckets: ref([{ name: 'sequencing' }]), ensure: vi.fn() }),
  },
  '@/composables/useS3': { useS3: () => ({ activeContext, nodeIdFor: () => 'n1' }) },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/composables/useBucketCheck': BucketCheck,
  '@/lib/api': { ...Api, createBackendImport, updateBackendImport, runBackendImport, startBucketMove },
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/storageRules': StorageRules,
  '@/lib/utils': Utils,
})

const BACKENDS = [
  { backend_id: 'b1', group_id: 'g1', kind: 's3', name: 'lab-store', public_config: { bucket: 'lab', endpoint: 'https://s3.lab.example' } },
]
const SPLIT = [
  {
    backend_id: 's1', group_id: 'g1', kind: 's3', name: 'lab-object-store',
    public_config: { endpoint: 'https://s3.lab.example', default_bucket: 'lab-default' },
  },
]
const STORED = {
  import_id: 'i1', backend_id: 'b1', backend_prefix: 'raw/2024/', bucket: 'sequencing', key_prefix: 'seq/',
  write_pattern: '{dir}{id}_{name}', created_at: '',
}

type Root = Parameters<typeof content>[0]

async function mount(link: unknown = null, extra: Record<string, unknown> = {}) {
  const state = reactive({
    open: false, groupId: 'g1', backends: BACKENDS, link, onSaved, 'onUpdate:open': onOpen, ...extra,
  })
  const mounted = await mountApp(defineComponent(() => () => h(LinkedFolderDialog, state)))
  state.open = true
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, state }
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
  startBucketMove.mockReset()
  runBackendImport.mockReset()
  checkProviderBucket.mockReset().mockRejectedValue(new Api.ApiError(404, 'Not Found'))
  onSaved.mockReset()
  onOpen.mockReset()
  activeContext.value = { nodeId: 'n1', groupId: 'g1' }
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
    expect(text).toContain('lab / raw/2024/run2/b.fastq~01JA7Q3K')
    await submit(mounted.root)

    expect(createBackendImport).toHaveBeenCalledWith(
      'g1',
      {
        backend_id: 'b1', backend_prefix: 'raw/2024/', bucket: 'sequencing', key_prefix: 'seq/',
        write_pattern: '{dir}{name}~{id}', schedule: '0 3 * * *',
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
      { backend_id: 'b1', backend_prefix: '', bucket: 'sequencing', key_prefix: '', write_pattern: '{dir}{name}~{id}' },
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

  it('keeps manual bucket entry when the cached buckets belong to another group', async () => {
    createBackendImport.mockResolvedValue({ ...STORED, import_id: 'new' })
    runBackendImport.mockResolvedValue({ job_id: 'j1' })
    activeContext.value = { nodeId: 'n1', groupId: 'g2' }
    const mounted = await mount()
    await typeValue(inputById(mounted.root, '-bucket'), 'other-bucket')
    await submit(mounted.root)

    expect(createBackendImport).toHaveBeenCalledWith('g1', expect.objectContaining({ bucket: 'other-bucket' }), expect.anything())
    mounted.app.unmount()
  })

  it('changes only the schedule of a stored link', async () => {
    updateBackendImport.mockResolvedValue(STORED)
    const mounted = await mount(STORED)
    expect(button(mounted.root, 'Save changes').props.disabled).toBe(true)
    await choose(mounted.root, 'Look for new files', '0 * * * *')
    await submit(mounted.root)

    expect(updateBackendImport).toHaveBeenCalledWith('g1', 'i1', '0 * * * *', expect.anything(), undefined)
    expect(createBackendImport).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('changes the file name of a stored link in place', async () => {
    updateBackendImport.mockResolvedValue(STORED)
    const mounted = await mount(STORED)
    await choose(mounted.root, 'File name preset', '{dir}{name}~{id}')
    expect(content(mounted.root)).toContain('Only new uploads get the new name.')
    expect(content(mounted.root)).toContain('lab / raw/2024/run2/b.fastq~01JA7Q3K')
    await typeValue(inputById(mounted.root, '-pattern'), '{dir}{id}')
    expect(button(mounted.root, 'Save changes').props.disabled).toBe(true)
    await typeValue(inputById(mounted.root, '-pattern'), '{dir}{name}~{id}')
    await submit(mounted.root)

    expect(updateBackendImport).toHaveBeenCalledWith('g1', 'i1', null, expect.anything(), '{dir}{name}~{id}')
    mounted.app.unmount()
  })

  it('keeps plain names of a whole linked provider bucket', async () => {
    const whole = { ...STORED, backend_id: 's1', backend_prefix: 'lab-raw/', key_prefix: '', write_pattern: '{dir}{name}' }
    const mounted = await mount(whole, { backends: SPLIT })
    const preset = element(mounted.root, (node) => node.tag === 'select' && node.props['aria-label'] === 'File name preset')
    expect(preset.props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('moves the files of a stored link only when there are some', async () => {
    startBucketMove.mockResolvedValue({})
    const none = await mount(STORED)
    expect(content(none.root)).not.toContain('Move files already in this folder')
    none.app.unmount()

    const mounted = await mount(STORED, { movable: true })
    expect(button(mounted.root, 'Save changes').props.disabled).toBe(true)
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Move files already in this folder'))
    await submit(mounted.root)
    expect(startBucketMove).toHaveBeenCalledWith('sequencing', 'seq/', expect.anything())
    expect(updateBackendImport).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('asks the node to move existing files of a new link', async () => {
    createBackendImport.mockResolvedValue({ ...STORED, import_id: 'new' })
    runBackendImport.mockResolvedValue({ job_id: 'j' })
    const mounted = await mount()
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Move files already in this folder'))
    await submit(mounted.root)
    expect(createBackendImport).toHaveBeenCalledWith('g1', expect.objectContaining({ move_existing: true }), expect.anything())
    mounted.app.unmount()
  })

  it('says so when a move for the new link is refused', async () => {
    createBackendImport.mockRejectedValue(new Api.ApiError(409, 'conflict', 'move_running'))
    const mounted = await mount()
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Move files already in this folder'))
    await submit(mounted.root)
    expect(content(mounted.root)).toContain('Another move is still running in this bucket.')
    mounted.app.unmount()
  })

  it('keeps a reopened form when a save of an earlier opening answers late', async () => {
    let failFirst: (err: unknown) => void = () => {}
    let answerSecond: (value: unknown) => void = () => {}
    createBackendImport
      .mockReturnValueOnce(new Promise((_, reject) => (failFirst = reject)))
      .mockReturnValueOnce(new Promise((resolve) => (answerSecond = resolve)))
    runBackendImport.mockResolvedValue({ job_id: 'j1' })
    const mounted = await mount()
    const reopen = async () => {
      mounted.state.open = false
      await flush()
      mounted.state.open = true
      await flush()
    }
    const startSave = async () => {
      await choose(mounted.root, 'To Aruna bucket', 'sequencing')
      const form = element(mounted.root, (node) => node.tag === 'form')
      void (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
      await flush()
    }

    await startSave()
    await reopen()
    failFirst(new Api.ApiError(409, 'Another link already uses this folder.'))
    await flush()
    expect(content(mounted.root)).not.toContain('Another link already uses this folder.')

    await startSave()
    await reopen()
    await typeValue(inputById(mounted.root, '-source-folder'), 'draft/')
    answerSecond({ ...STORED, import_id: 'new' })
    await flush()
    expect(onSaved).toHaveBeenCalledWith(undefined)
    expect(onOpen).not.toHaveBeenCalledWith(false)
    expect(inputById(mounted.root, '-source-folder').props.value).toBe('draft/')
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

  it('names the bucket on a storage without a fixed bucket', async () => {
    createBackendImport.mockResolvedValue({ ...STORED, import_id: 'new' })
    runBackendImport.mockResolvedValue({ job_id: 'j1' })
    const mounted = await mount(null, { backends: SPLIT, storageId: 's1' })
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(true)
    await typeValue(inputById(mounted.root, '-source-bucket'), 'lab-raw')
    await typeValue(inputById(mounted.root, '-source-folder'), '2024')
    await submit(mounted.root)

    expect(createBackendImport).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ backend_id: 's1', backend_prefix: 'lab-raw/2024/' }),
      expect.anything(),
    )
    mounted.app.unmount()
  })

  it('shows an overlap with the Aruna folder of another link', async () => {
    const other = { ...STORED, import_id: 'i2', bucket: 'sequencing', key_prefix: 'raw/' }
    const mounted = await mount(null, { backends: SPLIT, storageId: 's1', links: [other] })
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    await typeValue(inputById(mounted.root, '-source-bucket'), 'lab-new')
    await typeValue(inputById(mounted.root, '-bucket-folder'), 'raw/sub')
    expect(content(mounted.root)).toContain('This Aruna folder overlaps the link of sequencing / raw/.')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(true)
    await typeValue(inputById(mounted.root, '-bucket-folder'), 'other')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('shows overlaps and the default bucket before saving', async () => {
    const other = { ...STORED, import_id: 'i2', backend_id: 's1', backend_prefix: 'lab-raw/2024/', bucket: 'results', key_prefix: '' }
    const mounted = await mount(null, { backends: SPLIT, storageId: 's1', links: [other] })
    await choose(mounted.root, 'To Aruna bucket', 'sequencing')
    await typeValue(inputById(mounted.root, '-source-bucket'), 'lab-raw')
    await typeValue(inputById(mounted.root, '-source-folder'), '2024/old')
    expect(content(mounted.root)).toContain('This folder overlaps the link of results (whole bucket).')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(true)

    await typeValue(inputById(mounted.root, '-source-bucket'), 'lab-default')
    expect(content(mounted.root)).toContain("Bucket lab-default holds Aruna's files of a default rule.")
    await typeValue(inputById(mounted.root, '-source-bucket'), 'lab-new')
    expect(button(mounted.root, 'Link and run').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  describe('provider bucket check', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    async function typed(name: string) {
      const mounted = await mount(null, { backends: SPLIT, storageId: 's1' })
      await typeValue(inputById(mounted.root, '-source-bucket'), name)
      await vi.advanceTimersByTimeAsync(400)
      await flush()
      return mounted
    }

    it('names an existing bucket the keys can write to', async () => {
      checkProviderBucket.mockResolvedValue({ bucket: 'lab-raw', exists: true, writable: true })
      const mounted = await typed('lab-raw')

      expect(checkProviderBucket).toHaveBeenCalledTimes(1)
      expect(checkProviderBucket).toHaveBeenCalledWith('g1', 's1', 'lab-raw', expect.anything())
      expect(content(mounted.root)).toContain('Existing bucket. Aruna can write here.')
      mounted.app.unmount()
    })

    it('warns about an existing bucket the keys cannot write to', async () => {
      checkProviderBucket.mockResolvedValue({ bucket: 'lab-raw', exists: true, writable: false })
      const mounted = await typed('lab-raw')
      const note = element(mounted.root, (node) => node.tag === 'p' && content(node).includes('cannot write'))

      expect(content(note)).toContain('Existing bucket. These keys cannot write here.')
      expect(String(note.props.class)).toContain('text-amber-700')
      // The warning never blocks saving; the save itself probes the bucket.
      await choose(mounted.root, 'To Aruna bucket', 'sequencing')
      expect(button(mounted.root, 'Link and run').props.disabled).toBe(false)
      mounted.app.unmount()
    })

    it('names only an existing bucket on an older node', async () => {
      checkProviderBucket.mockResolvedValue({ bucket: 'lab-raw', exists: true })
      const mounted = await typed('lab-raw')

      expect(content(mounted.root)).toContain('Existing bucket.')
      expect(content(mounted.root)).not.toContain('write here')
      mounted.app.unmount()
    })

    it('names a bucket Aruna will create', async () => {
      checkProviderBucket.mockResolvedValue({ bucket: 'lab-new', exists: false })
      const mounted = await typed('lab-new')

      expect(content(mounted.root)).toContain('New bucket. Aruna creates it.')
      mounted.app.unmount()
    })

    it('keeps the neutral text when the node cannot check', async () => {
      const mounted = await typed('lab-raw')

      expect(checkProviderBucket).toHaveBeenCalledTimes(1)
      expect(content(mounted.root)).toContain('Aruna creates the bucket if it is missing.')
      expect(content(mounted.root)).not.toContain('Existing bucket')
      mounted.app.unmount()
    })
  })
})
