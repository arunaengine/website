import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketNaming from '@/lib/bucketNaming'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as Organize from '@/lib/organize'
import * as Storage from '@/lib/storage'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const listGroupBackends = vi.fn()
const getGroupRouting = vi.fn()
const getBucketRouting = vi.fn()
const listBackendImports = vi.fn()
const runBackendImport = vi.fn()
const getLinkStatus = vi.fn()
const listStorageBuckets = vi.fn()
const writesDisabled = ref(false)
const sessionEpoch = ref(0)

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const IconButtonStub = defineComponent({
  props: { label: String, disabled: Boolean },
  setup: (props, { attrs, slots }) => () =>
    h('button', { ...attrs, 'aria-label': props.label, disabled: props.disabled }, slots.default?.()),
})
// The edit dialog shows which bucket it opened for.
const mounts: string[] = []
const EditStub = defineComponent({
  props: { open: Boolean, link: Object, place: String },
  emits: ['update:open', 'saved'],
  setup: (props, { emit }) => {
    mounts.push((props.link as { import_id: string }).import_id)
    return () =>
      props.open
        ? h(
            'div',
            { 'data-testid': 'edit-dialog', onClose: () => emit('update:open', false), onSaved: () => emit('saved') },
            `${(props.link as { bucket: string }).bucket} ${props.place}`,
          )
        : null
  },
})
// The step label of a bucket row, as the row shows it.
const JobStub = defineComponent({
  props: { job: Object },
  setup: (props) => () => h('em', { 'data-testid': 'bucket-job' }, Organize.bucketJobLabel(props.job as never)),
})
const OpenStub = (testid: string) =>
  defineComponent({
    props: { open: Boolean },
    setup: (props) => () => (props.open ? h('div', { 'data-testid': testid }) : null),
  })

const StorageSection = compileClientComponent(new URL('./StorageSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slot },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/components/groups/StorageBackendDialog.vue': moduleDefault(OpenStub('storage-dialog')),
  '@/components/groups/NewBucketsDialog.vue': moduleDefault(OpenStub('new-buckets-dialog')),
  '@/components/groups/LinkBucketDialog.vue': moduleDefault(OpenStub('link-dialog')),
  '@/components/groups/BucketEditDialog.vue': moduleDefault(EditStub),
  '@/components/storage/BucketJobLabel.vue': moduleDefault(JobStub),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
    useAruna: () => ({
      apiBaseUrl: ref('https://api.test'),
      authToken: ref('bearer'),
      sessionEpoch,
      listGroupBackends,
      getGroupRouting,
      getBucketRouting,
    }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
  '@/lib/api': { ...Api, getLinkStatus, listBackendImports, listStorageBuckets, runBackendImport },
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/storage': Storage,
  '@/lib/storageRules': StorageRules,
  '@/lib/utils': Utils,
})

const STORAGE = {
  backend_id: 's1',
  group_id: 'g1',
  kind: 's3',
  name: 'spire',
  public_config: { endpoint: 's3.example.org', default_bucket: 'aruna-spire-default' },
}
const DAYS_AGO = new Date(Date.now() - 3 * 86_400_000).toISOString()
const run = (state: string) => ({ job_id: 'j', state, started_at: DAYS_AGO, imported: 6, skipped: 0, failed: 0, errors: [] })
const LINKS = [
  {
    import_id: 'i1',
    backend_id: 's1',
    backend_prefix: 'aruna-spire-genes/',
    bucket: 'genes',
    key_prefix: '',
    write_pattern: '{dir}{id}_{name}',
    created_at: '',
    last_run: run('succeeded'),
  },
  { import_id: 'i2', backend_id: 's1', backend_prefix: 'lab-raw/runs/', bucket: 'raw', key_prefix: '', created_at: '', last_run: run('running') },
]

type Root = Parameters<typeof content>[0]
const byTestId = (root: Root, id: string) => nodes(root).filter((node) => node.props['data-testid'] === id)
const buttonIn = (root: Root, text: string) => element(root, (node) => node.tag === 'button' && content(node).trim() === text)

async function mount(focusLink: string | null = null, onBackends?: (backends: unknown) => void) {
  const mounted = await mountApp(
    defineComponent(() => () => h(StorageSection, { groupId: 'g1', groupName: 'spire', canAdmin: true, focusLink, datasetBucket: 'datasets-g1', onBackends })),
  )
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

beforeEach(() => {
  vi.clearAllMocks()
  mounts.length = 0
  writesDisabled.value = false
  listGroupBackends.mockResolvedValue({ backends: [STORAGE] })
  getGroupRouting.mockResolvedValue({ group_id: 'g1', default_target: { backend_id: 's1' }, warnings: [] })
  getBucketRouting.mockResolvedValue({ bucket: 'datasets-g1', rules: [], warnings: [] })
  listBackendImports.mockResolvedValue(LINKS)
  runBackendImport.mockResolvedValue({ job_id: 'j2' })
  listStorageBuckets.mockResolvedValue({ buckets: [], next: null })
})

const listed = (bucket: string, extra: Record<string, unknown> = {}) => ({
  bucket,
  backend_id: 's1',
  provider_bucket: null,
  folder: null,
  shared: false,
  import_id: null,
  write_pattern: null,
  ...extra,
})

describe('StorageSection', () => {
  it('lists each bucket of a storage with its S3 bucket, naming and sync status', async () => {
    const { root } = await mount()
    const rows = byTestId(root, 'bucket-row')
    expect(rows).toHaveLength(2)
    expect(content(rows[0])).toContain('genes')
    expect(content(rows[0])).toContain('aruna-spire-genes')
    expect(content(rows[0])).toContain('{id}_{name}')
    expect(content(rows[0])).toContain('✓ 3d ago')
    expect(content(rows[1])).toContain('lab-raw/runs')
    expect(content(rows[1])).toContain('{name}')
    expect(content(rows[1])).toContain('Syncing…')
  })

  it('shows where new buckets go under their storage', async () => {
    const { root } = await mount()
    const [row] = byTestId(root, 'new-buckets-row')
    expect(content(row)).toContain('aruna-spire-default (shared)')

    getGroupRouting.mockResolvedValue({
      group_id: 'g1',
      default_target: { backend_id: 's1' },
      bucket_template: 'aruna-spire-{bucket}',
      warnings: [],
    })
    const own = await mount()
    expect(content(byTestId(own.root, 'new-buckets-row')[0])).toContain('aruna-spire-{bucket} (one each)')
  })

  it('puts new buckets under Aruna storage without a group default', async () => {
    getGroupRouting.mockResolvedValue({ group_id: 'g1', warnings: [] })
    const { root } = await mount()
    const aruna = byTestId(root, 'aruna-storage')[0]
    expect(content(aruna)).toContain('Gets new buckets.')
    expect(content(aruna)).toContain('on this node')
  })

  it('warns about files a sync did not add and lists them on click', async () => {
    const failed = { ...run('succeeded'), failed: 2, errors: [{ key: 'a.faa', error: 'Access denied' }] }
    listBackendImports.mockResolvedValue([{ ...LINKS[0], last_run: failed }])
    getLinkStatus.mockResolvedValue({ conflicts: [] })
    const { root } = await mount()
    const status = element(root, (node) => node.tag === 'button' && content(node).trim() === '! 2 failed')
    await click(status)
    await flush()
    expect(getLinkStatus).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    expect(content(byTestId(root, 'sync-problems')[0])).toContain('a.faa: Access denied')
  })

  it('fills a reopened failure list only from the newest answer', async () => {
    const failed = { ...run('succeeded'), failed: 1, errors: [] }
    listBackendImports.mockResolvedValue([{ ...LINKS[0], last_run: failed }])
    const answers: ((value: unknown) => void)[] = []
    getLinkStatus.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    const { root } = await mount()
    const status = () => element(root, (node) => node.tag === 'button' && content(node).trim() === '! 1 failed')
    const open = () => void (status().props.onClick as () => void)()
    open()
    open()
    open()
    await flush()
    answers[1]({ conflicts: [{ path: 'new.faa', reason: 'newer' }] })
    await flush()
    answers[0]({ conflicts: [{ path: 'old.faa', reason: 'older' }] })
    await flush()
    const list = content(byTestId(root, 'sync-problems')[0])
    expect(list).toContain('new.faa')
    expect(list).not.toContain('old.faa')
  })

  it('lists every bucket under the storage that keeps its files', async () => {
    listStorageBuckets.mockResolvedValue({
      buckets: [
        listed('genes', { provider_bucket: 'aruna-spire-genes', folder: '', import_id: 'i1' }),
        listed('samples', { provider_bucket: 'aruna-spire-default', shared: true }),
        listed('scratch', { backend_id: null }),
      ],
      next: null,
    })
    const { root } = await mount()
    const storage = byTestId(root, 'storage-s1')[0]
    const rows = byTestId(storage, 'bucket-row')
    expect(rows.map((row) => content(row).split('⇆')[0].split('→')[0].trim())).toEqual(['genes', 'samples', 'raw'])
    expect(content(rows[0])).toContain('✓ 3d ago')
    expect(content(rows[1])).toContain('aruna-spire-default (shared)')
    expect(content(rows[1])).toContain('chosen by Aruna')
    const aruna = byTestId(root, 'aruna-storage')[0]
    expect(content(byTestId(aruna, 'bucket-row')[0])).toContain('scratch')
    expect(content(byTestId(aruna, 'bucket-row')[0])).toContain('on this node')
  })

  it('marks each bucket that has a step running', async () => {
    listStorageBuckets.mockResolvedValue({
      buckets: [
        listed('genes', { provider_bucket: 'aruna-spire-genes', folder: '', import_id: 'i1', job: { kind: 'rename', state: 'running', done: 4, failed: 0 } }),
        listed('samples', { provider_bucket: 'aruna-spire-default', shared: true, job: { kind: 'move', state: 'paused', done: 1, failed: 0 } }),
        listed('scratch', { backend_id: null, job: { kind: 'compression', state: 'running', done: 0, failed: 0 } }),
        listed('plain', { provider_bucket: 'aruna-spire-default', shared: true }),
      ],
      next: null,
    })
    const { root } = await mount()
    const labelOf = (name: string) =>
      byTestId(nodes(root).find((node) => node.props['data-testid'] === 'bucket-row' && content(node).includes(name))!, 'bucket-job').map(content)
    expect(labelOf('genes')).toEqual(['Renaming'])
    expect(labelOf('samples')).toEqual(['Moving (paused)'])
    expect(labelOf('scratch')).toEqual(['Compressing'])
    expect(labelOf('plain')).toEqual([])
  })

  it('shows no step label when the node sends none', async () => {
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', { import_id: 'i1' })], next: null })
    const { root } = await mount()
    expect(byTestId(root, 'bucket-job')).toHaveLength(0)
  })

  it('shows the linked buckets without labels or an error on a node without the listing', async () => {
    listStorageBuckets.mockRejectedValue({ status: 404 })
    const { root } = await mount()
    expect(byTestId(root, 'bucket-row')).toHaveLength(2)
    expect(byTestId(root, 'bucket-job')).toHaveLength(0)
  })

  it('shows no storage and no label to a caller the listing refuses', async () => {
    listStorageBuckets.mockRejectedValue(new Api.ApiError(403, 'forbidden'))
    const { root } = await mount()
    expect(content(root)).toContain('Storage is only visible to group admins.')
    expect(byTestId(root, 'bucket-row')).toHaveLength(0)
  })

  it('reads the listing again while a step runs and stops when none does', async () => {
    vi.useFakeTimers()
    try {
      listBackendImports.mockResolvedValue([LINKS[0]])
      const running = { buckets: [listed('genes', { import_id: 'i1', job: { kind: 'rename', state: 'running', done: 4, failed: 0 } })], next: null }
      listStorageBuckets.mockResolvedValue(running)
      const { root } = await mount()
      expect(listStorageBuckets).toHaveBeenCalledTimes(1)
      listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', { import_id: 'i1' })], next: null })
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(listStorageBuckets).toHaveBeenCalledTimes(2)
      expect(byTestId(root, 'bucket-job')).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(listStorageBuckets).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('updates the rows in place and reports no storage change while it follows a step', async () => {
    vi.useFakeTimers()
    try {
      listBackendImports.mockResolvedValue([LINKS[0]])
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', { import_id: 'i1', job })], next: null })
      const onBackends = vi.fn()
      const { root } = await mount(null, onBackends)
      const row = byTestId(root, 'bucket-row')[0]
      expect(onBackends).toHaveBeenCalledTimes(1)
      listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', { import_id: 'i1', job: { ...job, done: 9 } })], next: null })
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      // The poll updates the row in place; the dataset location below is not read again.
      expect(listStorageBuckets).toHaveBeenCalledTimes(2)
      expect(byTestId(root, 'bucket-row')[0]).toBe(row)
      expect(onBackends).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a storage or rule changed elsewhere while it follows a step', async () => {
    vi.useFakeTimers()
    try {
      listBackendImports.mockResolvedValue([LINKS[0]])
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', { import_id: 'i1', job })], next: null })
      const onBackends = vi.fn()
      await mount(null, onBackends)
      listGroupBackends.mockResolvedValue({ backends: [{ ...STORAGE, name: 'spire-old', disabled: true }] })
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(onBackends).toHaveBeenCalledTimes(2)
      expect(onBackends).toHaveBeenLastCalledWith([{ ...STORAGE, name: 'spire-old', disabled: true }])
      getGroupRouting.mockResolvedValue({ group_id: 'g1', default_target: null, warnings: [] })
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(onBackends).toHaveBeenCalledTimes(3)
      // A rule of the dataset bucket names the storage of the location line first.
      const rule = { key_prefix: '', exact: false, target: { backend_id: 's1' } }
      getBucketRouting.mockResolvedValue({ bucket: 'datasets-g1', rules: [rule], warnings: [] })
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(getBucketRouting).toHaveBeenLastCalledWith('datasets-g1')
      expect(onBackends).toHaveBeenCalledTimes(4)
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(onBackends).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('compares the rules of a new dataset bucket only with its own, not with a late answer for the old one', async () => {
    vi.useFakeTimers()
    try {
      listBackendImports.mockResolvedValue([LINKS[0]])
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', { import_id: 'i1', job })], next: null })
      const override = { key_prefix: '', exact: false, target: { class: 'cold' } }
      const rulesOf: Record<string, unknown[]> = { a: [], b: [override] }
      let holdA = false
      let late: (value: unknown) => void = () => {}
      getBucketRouting.mockImplementation((bucket: string) => {
        if (bucket === 'a' && holdA) {
          holdA = false
          return new Promise((resolve) => (late = resolve))
        }
        return Promise.resolve({ bucket, rules: rulesOf[bucket], warnings: [] })
      })
      const bucket = ref('a')
      const onBackends = vi.fn()
      await mountApp(
        defineComponent(() => () =>
          h(StorageSection, { groupId: 'g1', groupName: 'spire', canAdmin: true, datasetBucket: bucket.value, onBackends }),
        ),
      )
      await flush()
      expect(onBackends).toHaveBeenCalledTimes(1)
      // The next poll for bucket a is still on its way when the dataset location moves to b.
      holdA = true
      await vi.advanceTimersByTimeAsync(3000)
      bucket.value = 'b'
      await flush()
      late({ bucket: 'a', rules: [], warnings: [] })
      await flush()
      // B's rule is removed in another tab before B's next poll.
      rulesOf.b = []
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(onBackends).toHaveBeenLastCalledWith([STORAGE])
      expect(onBackends).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports no change when the node sends the connection settings in another order', async () => {
    vi.useFakeTimers()
    try {
      listBackendImports.mockResolvedValue([LINKS[0]])
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', { import_id: 'i1', job })], next: null })
      const onBackends = vi.fn()
      await mount(null, onBackends)
      const { endpoint, default_bucket } = STORAGE.public_config
      listGroupBackends.mockResolvedValue({ backends: [{ ...STORAGE, public_config: { default_bucket, endpoint } }] })
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(listGroupBackends).toHaveBeenCalledTimes(2)
      expect(onBackends).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('follows a step on a later page without dropping the pages shown', async () => {
    vi.useFakeTimers()
    try {
      listBackendImports.mockResolvedValue([LINKS[0]])
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      const first = { buckets: [listed('alpha', { shared: true, provider_bucket: 'shared' })], next: 'c1' }
      let second = { buckets: [listed('beta', { shared: true, provider_bucket: 'shared', job })], next: null }
      listStorageBuckets.mockImplementation((_group: string, page: { after?: string }) =>
        Promise.resolve(page.after === 'c1' ? second : first),
      )
      const { root } = await mount()
      await click(buttonIn(root, 'Show more buckets'))
      expect(byTestId(root, 'bucket-job')).toHaveLength(1)
      const calls = listStorageBuckets.mock.calls.length
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      // Both pages are read again and stay shown, with no button to load the second.
      expect(listStorageBuckets.mock.calls.length).toBe(calls + 2)
      expect(content(root)).toContain('beta')
      expect(byTestId(root, 'bucket-job')).toHaveLength(1)
      second = { buckets: [listed('beta', { shared: true, provider_bucket: 'shared' })], next: null }
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(byTestId(root, 'bucket-job')).toHaveLength(0)
      expect(content(root)).toContain('beta')
      const done = listStorageBuckets.mock.calls.length
      await vi.advanceTimersByTimeAsync(30_000)
      expect(listStorageBuckets.mock.calls.length).toBe(done)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the pages shown and follows a step when a bucket dialog reports a change', async () => {
    vi.useFakeTimers()
    try {
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      const first = { buckets: [listed('alpha', { shared: true, provider_bucket: 'shared' })], next: 'c1' }
      let second = { buckets: [listed('beta', { shared: true, provider_bucket: 'shared' })], next: null }
      listStorageBuckets.mockImplementation((_group: string, page: { after?: string }) =>
        Promise.resolve(page.after === 'c1' ? second : first),
      )
      const { root } = await mount()
      await click(buttonIn(root, 'Show more buckets'))
      await click(nodes(root).find((node) => node.props.title === 'Settings and organize')!)
      // A rename on the second page is accepted: the dialog asks for a new read.
      second = { buckets: [listed('beta', { shared: true, provider_bucket: 'shared', job })], next: null }
      ;(byTestId(root, 'edit-dialog')[0].props.onSaved as () => void)()
      await flush()
      await flush()
      expect(content(root)).toContain('alpha')
      expect(content(root)).toContain('beta')
      expect(byTestId(root, 'bucket-job')).toHaveLength(1)
      // The step is followed from the second page, and it is still there after the next read.
      const calls = listStorageBuckets.mock.calls.length
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(listStorageBuckets.mock.calls.length).toBe(calls + 2)
      expect(content(root)).toContain('beta')
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([true, false])('reads once more after a page that was on its way (answered: %s), so a rename started meanwhile is followed', async (answered) => {
    vi.useFakeTimers()
    try {
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      let started = false
      let settle: (ok: boolean) => void = () => {}
      let pending = true
      const second = { buckets: [listed('beta', { shared: true, provider_bucket: 'shared' })], next: null }
      listStorageBuckets.mockImplementation((_group: string, page: { after?: string }) => {
        if (page.after === 'c1') {
          if (!pending) return Promise.resolve(second)
          pending = false
          return new Promise((resolve, reject) => (settle = (ok) => (ok ? resolve(second) : reject(new Error('page failed')))))
        }
        const alpha = listed('alpha', { shared: true, provider_bucket: 'shared', ...(started ? { job } : {}) })
        return Promise.resolve({ buckets: [alpha], next: 'c1' })
      })
      const { root } = await mount()
      void (buttonIn(root, 'Show more buckets').props.onClick as () => void)()
      await flush()
      await click(nodes(root).find((node) => node.props.title === 'Settings and organize')!)
      // A rename is accepted and then seen while the page is still on its way.
      started = true
      const saved = byTestId(root, 'edit-dialog')[0].props.onSaved as () => void
      saved()
      saved()
      await flush()
      await flush()
      expect(byTestId(root, 'bucket-job')).toHaveLength(0)
      settle(answered)
      await flush()
      await flush()
      expect(content(root).includes('beta')).toBe(answered)
      expect(byTestId(root, 'bucket-job')).toHaveLength(1)
      // The step is followed: the pages shown are read again on the next tick.
      const calls = listStorageBuckets.mock.calls.length
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      expect(listStorageBuckets.mock.calls.length).toBe(calls + (answered ? 2 : 1))
      expect(byTestId(root, 'bucket-job')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a page that is being added when a poll answers', async () => {
    vi.useFakeTimers()
    try {
      listBackendImports.mockResolvedValue([LINKS[0]])
      const job = { kind: 'rename', state: 'running', done: 4, failed: 0 }
      const first = { buckets: [listed('alpha', { shared: true, provider_bucket: 'shared', job })], next: 'c1' }
      let answer: (value: unknown) => void = () => {}
      listStorageBuckets.mockImplementation((_group: string, page: { after?: string }) =>
        page.after === 'c1' ? new Promise((resolve) => (answer = resolve)) : Promise.resolve(first),
      )
      const { root } = await mount()
      void (buttonIn(root, 'Show more buckets').props.onClick as () => void)()
      await vi.advanceTimersByTimeAsync(3000)
      await flush()
      answer({ buckets: [listed('beta', { shared: true, provider_bucket: 'shared' })], next: null })
      await flush()
      expect(content(root)).toContain('beta')
      expect(content(root)).toContain('alpha')
    } finally {
      vi.useRealTimers()
    }
  })

  it('pages through the bucket listing', async () => {
    listStorageBuckets
      .mockResolvedValueOnce({ buckets: [listed('alpha', { shared: true, provider_bucket: 'shared' })], next: 'c1' })
      .mockResolvedValueOnce({ buckets: [listed('beta', { shared: true, provider_bucket: 'shared' })], next: null })
    const { root } = await mount()
    expect(content(root)).not.toContain('beta')
    await click(buttonIn(root, 'Show more buckets'))
    expect(listStorageBuckets).toHaveBeenLastCalledWith('g1', { limit: 200, after: 'c1' }, expect.anything())
    expect(content(root)).toContain('beta')
    expect(nodes(root).some((node) => node.tag === 'button' && content(node).trim() === 'Show more buckets')).toBe(false)
  })

  it('starts the listing over on a refresh', async () => {
    const first = { buckets: [listed('alpha', { shared: true, provider_bucket: 'shared' })], next: 'c1' }
    listStorageBuckets
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ buckets: [listed('beta', { shared: true, provider_bucket: 'shared' })], next: null })
      .mockResolvedValueOnce(first)
    const { root } = await mount()
    await click(buttonIn(root, 'Show more buckets'))
    expect(content(root)).toContain('beta')
    await click(nodes(root).find((node) => node.props['aria-label'] === 'Sync now')!)
    await flush()
    expect(content(root)).not.toContain('beta')
    expect(buttonIn(root, 'Show more buckets').props.disabled).toBe(false)
  })

  it('drops a page request of the group that was left', async () => {
    let fail: (reason: unknown) => void = () => {}
    listStorageBuckets.mockImplementation((_group: string, page: { after?: string }) =>
      page.after ? new Promise((_, reject) => (fail = reject)) : Promise.resolve({ buckets: [], next: 'c1' }),
    )
    const props = reactive({ groupId: 'g1', groupName: 'spire', canAdmin: true })
    const { root } = await mountApp(defineComponent(() => () => h(StorageSection, props)))
    await flush()
    void (buttonIn(root, 'Show more buckets').props.onClick as () => void)()
    await flush()
    props.groupId = 'g2'
    await flush()
    await flush()
    fail(new Error('old group failed'))
    await flush()
    expect(content(root)).not.toContain('old group failed')
    expect(buttonIn(root, 'Show more buckets').props.disabled).toBe(false)
  })

  it('names the fixed bucket of a connection when the listing has none', async () => {
    listGroupBackends.mockResolvedValue({ backends: [{ ...STORAGE, public_config: { endpoint: 'https://s3', bucket: 'fixed-data' } }] })
    listStorageBuckets.mockResolvedValue({
      buckets: [listed('samples', { shared: true }), listed('runs', { folder: 'raw/' })],
      next: null,
    })
    const { root } = await mount()
    const text = content(byTestId(root, 'storage-s1')[0])
    expect(text).toContain('fixed-data (shared)')
    expect(text).toContain('fixed-data/raw')
  })

  it('starts a sync only for a bucket that is not syncing', async () => {
    const { root } = await mount()
    const [first, second] = nodes(root).filter((node) => node.props['aria-label'] === 'Sync now')
    expect(second.props.disabled).toBe(true)
    await click(first)
    expect(runBackendImport).toHaveBeenCalledWith('g1', 'i1', expect.anything())
  })

  it('shows the wait on Sync now, starts one sync and frees the buttons when it fails', async () => {
    let refuse: (err: Error) => void = () => {}
    runBackendImport.mockReturnValue(new Promise((_, reject) => (refuse = reject)))
    const { root } = await mount()
    const first = () => nodes(root).filter((node) => node.props['aria-label'] === 'Sync now')[0]
    void (first().props.onClick as () => Promise<void>)()
    await flush()
    expect(first().props['aria-busy']).toBe(true)
    expect(first().props.disabled).toBe(true)
    expect(content(first())).toBe('Starting the sync')
    await (first().props.onClick as () => Promise<void>)()
    expect(runBackendImport).toHaveBeenCalledTimes(1)
    refuse(new Error('refused'))
    await flush()
    await flush()
    expect(first().props['aria-busy']).toBe(false)
    expect(first().props.disabled).toBe(false)
    expect(content(root)).toContain('refused')
  })

  it('starts a new session without the wait or the error of a sync from the one before', async () => {
    let refuse: (err: Error) => void = () => {}
    runBackendImport.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)))
    const { root } = await mount()
    const first = () => nodes(root).filter((node) => node.props['aria-label'] === 'Sync now')[0]
    void (first().props.onClick as () => Promise<void>)()
    await flush()
    expect(first().props['aria-busy']).toBe(true)
    sessionEpoch.value++
    await flush()
    await flush()
    expect(first().props['aria-busy']).toBe(false)
    expect(first().props.disabled).toBe(false)
    refuse(new Error('the old session was refused'))
    await flush()
    expect(content(root)).not.toContain('the old session was refused')
  })

  it('opens the bucket edit from a row and from the address', async () => {
    const { root } = await mount()
    await click(element(byTestId(root, 'bucket-row')[0], (node) => node.tag === 'button' && content(node).trim() === 'Edit'))
    expect(content(byTestId(root, 'edit-dialog')[0])).toBe('genes aruna-spire-genes')

    const focused = await mount('i2')
    expect(content(byTestId(focused.root, 'edit-dialog')[0])).toBe('raw lab-raw/runs')
  })

  it('gives each bucket its own edit dialog and drops it when closed', async () => {
    const { root } = await mount()
    const edit = (row: number) =>
      click(element(byTestId(root, 'bucket-row')[row], (node) => node.tag === 'button' && content(node).trim() === 'Edit'))
    await edit(0)
    await edit(1)
    expect(mounts).toEqual(['i1', 'i2'])
    expect(content(byTestId(root, 'edit-dialog')[0])).toBe('raw lab-raw/runs')
    ;(byTestId(root, 'edit-dialog')[0].props.onClose as () => void)()
    await flush()
    expect(byTestId(root, 'edit-dialog')).toHaveLength(0)
  })

  it('opens the dialogs for new buckets, linking and the connection', async () => {
    const { root } = await mount()
    await click(buttonIn(root, '+ Link an S3 bucket'))
    await click(buttonIn(root, '+ Add storage'))
    expect(byTestId(root, 'link-dialog')).toHaveLength(1)
    expect(byTestId(root, 'storage-dialog')).toHaveLength(1)
    await click(element(byTestId(root, 'new-buckets-row')[0], (node) => node.tag === 'button'))
    expect(byTestId(root, 'new-buckets-dialog')).toHaveLength(1)
  })
})
