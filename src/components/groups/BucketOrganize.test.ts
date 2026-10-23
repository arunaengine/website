import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketNaming from '@/lib/bucketNaming'
import * as CursorPage from '@/composables/useCursorPage'
import * as Organize from '@/lib/organize'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const getOrganizeJob = vi.fn()
const getLinkStatus = vi.fn()
const previewDuplicates = vi.fn()
const startDuplicates = vi.fn()
const getImportRenames = vi.fn()
const startImportRenames = vi.fn()

// The real link state reads its steps through these; the panel's own calls use the map below.
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof Api>()),
  getImportRenames: (...args: unknown[]) => getImportRenames(...args),
  getOrganizeJob: (...args: unknown[]) => getOrganizeJob(...args),
  getLinkStatus: (...args: unknown[]) => getLinkStatus(...args),
}))

const Slot = defineComponent((_, { slots }) => () => h('div', [slots.head?.(), slots.default?.()]))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const BucketOrganize = compileClientComponent(new URL('./BucketOrganize.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/storage/JobProgress.vue': moduleDefault(defineComponent(() => () => h('p', 'job running'))),
  '@/components/storage/PagedList.vue': moduleDefault(
    defineComponent({
      props: { summary: String },
      setup: (props, { slots }) => () => h('div', [slots.head?.(), slots.default?.(), h('span', props.summary ?? '')]),
    }),
  ),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('span', p.label) })),
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

async function mount(initial: { job?: unknown; lastJob?: unknown } = {}, listeners: Record<string, unknown> = {}) {
  const finished = ref(0)
  const steps = reactive({ job: initial.job ?? null, lastJob: initial.lastJob ?? null })
  const mounted = await mountApp(
    defineComponent(() => () =>
      h(BucketOrganize, {
        groupId: 'g1',
        link: LINK,
        place: 'aruna-spire-genes',
        job: steps.job,
        lastJob: steps.lastJob,
        finished: finished.value,
        ...listeners,
      }),
    ),
  )
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, finished, steps }
}

const GB = 1024 ** 3
const PLAN = {
  bytes: 826 * GB,
  streamed_files: 0,
  streamed_bytes: 0,
  taken_files: 0,
  withheld_files: 0,
  unchanged_files: 297137,
  unchanged_bytes: 9 * GB,
}
const PLANNED = { count: 3877, complete: true, files: [{ from: '01M5_a.faa', to: 'a.faa' }], plan: PLAN }

beforeEach(() => {
  previewDuplicates.mockReset().mockResolvedValue({ total: 6, bytes: 6, complete: true, items: [COPY], next: null })
  startDuplicates.mockReset().mockResolvedValue({})
  getImportRenames.mockReset().mockResolvedValue({ count: 0, complete: true, files: [] })
  startImportRenames.mockReset().mockResolvedValue({})
  getOrganizeJob.mockReset().mockResolvedValue(null)
  getLinkStatus.mockReset().mockResolvedValue({ conflicts: [] })
})

describe('BucketOrganize rename plan', () => {
  it('counts the files first and keeps Review off until the plan is read', async () => {
    let answer: (value: unknown) => void = () => {}
    getImportRenames.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { root } = await mount()
    const card = step(root, 'step-renames')[0]
    expect(content(card)).toContain('Counting files…')
    expect(buttonIn(card, 'Review…').props.disabled).toBe(true)
    answer(PLANNED)
    await flush()
    expect(content(step(root, 'step-renames')[0])).not.toContain('Counting files…')
    expect(buttonIn(step(root, 'step-renames')[0], 'Review…').props.disabled).toBeFalsy()
  })

  it('does not offer the step while the count is unknown and the read failed', async () => {
    getImportRenames.mockRejectedValue(new Error('node down'))
    const { root } = await mount()
    expect(step(root, 'step-renames')).toHaveLength(0)
  })

  it('tells what the rename will do above the list', async () => {
    getImportRenames.mockResolvedValue(PLANNED)
    const { root } = await mount()
    expect(content(root)).not.toContain('This rename will')
    await click(buttonIn(step(root, 'step-renames')[0], 'Review…'))
    const plan = content(step(root, 'rename-plan')[0]).replace(/\s+/g, ' ')
    expect(plan).toContain('This rename will')
    expect(plan).toContain('rename 3,877 files (826 GB) in your storage')
    expect(plan).toContain('copy them inside your storage, not through Aruna')
    expect(plan).toContain('leave 297,137 files as they are')
    expect(plan).toContain('Large renames can take hours. They run on the server, so you can close this window.')
    expect(content(root)).toContain('Rename 3,877 files')
  })

  it('says how many files go through Aruna', async () => {
    getImportRenames.mockResolvedValue({ ...PLANNED, plan: { ...PLAN, streamed_files: 12, streamed_bytes: 3 * GB } })
    const { root } = await mount()
    await click(buttonIn(step(root, 'step-renames')[0], 'Review…'))
    const plan = content(step(root, 'rename-plan')[0])
    expect(plan).toContain('copy 12 files (3 GB) through Aruna and the rest inside your storage')
    expect(plan).not.toContain('not through Aruna')
  })

  it('leaves out the plan box on a node that sends no plan', async () => {
    getImportRenames.mockResolvedValue({ count: 3, complete: true, files: [{ from: '01M5_a.faa', to: 'a.faa' }] })
    const { root } = await mount()
    await click(buttonIn(step(root, 'step-renames')[0], 'Review…'))
    expect(step(root, 'rename-plan')).toHaveLength(0)
    expect(content(root)).toContain('Rename 3 files')
  })
})

const RENAMING = { kind: 'rename', state: 'running', done: 152, total: 3877, counted: true, skipped: 0, failed: 0, controls: true }
const RENAMED = { ...RENAMING, state: 'done', done: 3874, failed: 3, started_at_ms: 1, finished_at_ms: 2 }
const stepOf = (root: Root) => step(root, 'step-renames')[0]

describe('BucketOrganize rename run', () => {
  beforeEach(() => getImportRenames.mockResolvedValue(PLANNED))

  it('locks the review while a rename runs and shows its progress', async () => {
    const { root } = await mount({ job: RENAMING })
    const card = stepOf(root)
    expect(buttonIn(card, 'Review…').props.disabled).toBe(true)
    expect(buttonIn(card, 'Review…').props.title).toBe('A rename is running')
    expect(content(card)).toContain('job running')
    expect(content(card)).not.toContain('3,877 files')
  })

  it('locks the review of a paused rename too', async () => {
    const { root } = await mount({ job: { ...RENAMING, state: 'paused' } })
    expect(buttonIn(stepOf(root), 'Review…').props.disabled).toBe(true)
  })

  it('hides an open list and its Rename button once a rename starts', async () => {
    const { root, steps } = await mount()
    await click(buttonIn(stepOf(root), 'Review…'))
    expect(content(root)).toContain('Rename 3,877 files')
    steps.job = RENAMING
    await flush()
    expect(content(root)).not.toContain('Rename 3,877 files')
    expect(step(root, 'rename-plan')).toHaveLength(0)
    expect(buttonIn(stepOf(root), 'Review…').props.disabled).toBe(true)
  })

  it('keeps the review open while another kind of step runs', async () => {
    const { root } = await mount({ job: { ...RENAMING, kind: 'duplicates' } })
    expect(buttonIn(stepOf(root), 'Review…').props.disabled).toBeFalsy()
  })

  it('says how many files were renamed and how many kept their old name', async () => {
    getImportRenames.mockResolvedValue({ ...PLANNED, count: 3 })
    const { root } = await mount({ lastJob: RENAMED })
    const text = content(stepOf(root))
    expect(text).toContain('3,874 files renamed.')
    expect(text).toContain('3 files kept their old name.')
    expect(() => buttonIn(stepOf(root), 'Review…')).toThrow()
    await click(buttonIn(stepOf(root), 'Show them'))
    expect(content(root)).toContain('Rename 3 files')
  })

  it('stays quiet about failures when none failed', async () => {
    getImportRenames.mockResolvedValue({ count: 0, complete: true, files: [], plan: PLAN })
    const { root } = await mount({ lastJob: { ...RENAMED, failed: 0 } })
    expect(content(stepOf(root))).toContain('3,874 files renamed.')
    expect(content(stepOf(root))).not.toContain('kept')
    expect(content(stepOf(root))).not.toContain('skipped')
  })

  it('shows no result for a rename that was stopped', async () => {
    getImportRenames.mockResolvedValue({ count: 0, complete: true, files: [], plan: PLAN })
    const { root } = await mount({ lastJob: { ...RENAMED, state: 'aborted' } })
    expect(step(root, 'step-renames')).toHaveLength(0)
  })
})

describe('BucketOrganize rename start', () => {
  beforeEach(() => getImportRenames.mockResolvedValue(PLANNED))

  it('tells the parent a rename was accepted, with the file count', async () => {
    const renaming = vi.fn()
    const started = vi.fn()
    const { root } = await mount({}, { onRenaming: renaming, onStarted: started })
    await click(buttonIn(stepOf(root), 'Review…'))
    await click(buttonIn(root, 'Rename 3,877 files'))
    expect(startImportRenames).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    expect(renaming).toHaveBeenCalledWith(3877)
    expect(started).not.toHaveBeenCalled()
  })

  it('leaves the button usable and shows the error when the start is refused', async () => {
    startImportRenames.mockRejectedValue(new Error('refused'))
    const renaming = vi.fn()
    const { root } = await mount({}, { onRenaming: renaming })
    await click(buttonIn(stepOf(root), 'Review…'))
    await click(buttonIn(root, 'Rename 3,877 files'))
    expect(renaming).not.toHaveBeenCalled()
    expect(content(root)).toContain('refused')
    expect(buttonIn(root, 'Rename 3,877 files').props.disabled).toBeFalsy()
  })

  it('locks the review and hides the list at once, before any read shows the step', async () => {
    const { useLinkState } = await import('@/composables/useLinkState')
    getOrganizeJob.mockReturnValue(new Promise(() => {}))
    const mounted = await mountApp(
      defineComponent(() => {
        const state = useLinkState(() => 'g1', () => 'i1')
        return () =>
          h(BucketOrganize, {
            groupId: 'g1',
            link: LINK,
            place: 'aruna-spire-genes',
            job: state.job.value,
            lastJob: state.lastJob.value,
            onRenaming: state.begin,
          })
      }),
    )
    await flush()
    await click(buttonIn(stepOf(mounted.root), 'Review…'))
    await click(buttonIn(mounted.root, 'Rename 3,877 files'))
    const card = stepOf(mounted.root)
    expect(buttonIn(card, 'Review…').props.disabled).toBe(true)
    expect(() => buttonIn(mounted.root, 'Rename 3,877 files')).toThrow()
    expect(step(mounted.root, 'rename-plan')).toHaveLength(0)
    expect(content(card)).toContain('job running')
  })
})

describe('BucketOrganize', () => {
  it('says so when there is nothing to clean up', async () => {
    previewDuplicates.mockResolvedValue({ total: 0, bytes: 0, complete: true, items: [] })
    const { root } = await mount()
    expect(content(root)).toContain('Nothing to clean up.')
    expect(step(root, 'step-duplicates')).toHaveLength(0)
    expect(step(root, 'step-renames')).toHaveLength(0)
  })

  it('does not call a failed check nothing to clean up', async () => {
    previewDuplicates.mockRejectedValue(new Error('node down'))
    const { root } = await mount()
    expect(content(root)).not.toContain('Nothing to clean up.')
    expect(content(root)).toContain('node down')
  })

  it('does not call the bucket clean when a check route is missing', async () => {
    previewDuplicates.mockResolvedValue({ total: 0, bytes: 0, complete: true, items: [] })
    getImportRenames.mockRejectedValue({ status: 404 })
    const { root } = await mount()
    expect(content(root)).not.toContain('Nothing to clean up.')
    expect(content(root)).toContain('This node cannot check this bucket yet.')
  })

  it('shows only steps with work, with a partial count as at least', async () => {
    getImportRenames.mockResolvedValue({ count: 3, complete: false, files: [] })
    const { root } = await mount()
    expect(content(step(root, 'step-duplicates')[0])).toContain('6 files with copies')
    expect(content(step(root, 'step-renames')[0])).toContain('at least 3 files')
    expect(content(root)).not.toContain('Nothing to clean up.')
  })

  it('deletes copies only after the review is confirmed', async () => {
    const { root } = await mount()
    await click(buttonIn(step(root, 'step-duplicates')[0], 'Review…'))
    expect(content(root)).toContain('01M5_a.faa')
    expect(startDuplicates).not.toHaveBeenCalled()
    expect(content(root)).toContain('Showing 1 · 6 files with copies')
    await click(buttonIn(root, 'Remove copies of 6 files'))
    expect(startDuplicates).toHaveBeenCalledWith('g1', 'i1', expect.anything())
  })

  it('reads an open rename review again after a step ended', async () => {
    getImportRenames.mockResolvedValue({ count: 1, complete: true, files: [{ from: '01M5_a.faa', to: 'a.faa' }] })
    const { root, finished } = await mount()
    await click(buttonIn(step(root, 'step-renames')[0], 'Review…'))
    getImportRenames.mockResolvedValue({ count: 1, complete: true, files: [{ from: '01M6_b.faa', to: 'b.faa' }] })
    finished.value++
    await flush()
    await flush()
    expect(content(root)).toContain('01M6_b.faa')
  })
})
