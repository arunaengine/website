import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketNaming from '@/lib/bucketNaming'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as Storage from '@/lib/storage'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const listGroupBackends = vi.fn()
const getGroupRouting = vi.fn()
const listBackendImports = vi.fn()
const runBackendImport = vi.fn()
const writesDisabled = ref(false)

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
  emits: ['update:open'],
  setup: (props, { emit }) => {
    mounts.push((props.link as { import_id: string }).import_id)
    return () =>
      props.open
        ? h('div', { 'data-testid': 'edit-dialog', onClose: () => emit('update:open', false) }, `${(props.link as { bucket: string }).bucket} ${props.place}`)
        : null
  },
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
  '@/components/groups/StorageBackendDialog.vue': moduleDefault(OpenStub('storage-dialog')),
  '@/components/groups/NewBucketsDialog.vue': moduleDefault(OpenStub('new-buckets-dialog')),
  '@/components/groups/LinkBucketDialog.vue': moduleDefault(OpenStub('link-dialog')),
  '@/components/groups/BucketEditDialog.vue': moduleDefault(EditStub),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({
      apiBaseUrl: ref('https://api.test'),
      authToken: ref('bearer'),
      sessionEpoch: ref(0),
      listGroupBackends,
      getGroupRouting,
    }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
  '@/lib/api': { ...Api, listBackendImports, runBackendImport },
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

async function mount(focusLink: string | null = null) {
  const mounted = await mountApp(
    defineComponent(() => () => h(StorageSection, { groupId: 'g1', groupName: 'spire', canAdmin: true, focusLink })),
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
  listBackendImports.mockResolvedValue(LINKS)
  runBackendImport.mockResolvedValue({ job_id: 'j2' })
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

  it('starts a sync only for a bucket that is not syncing', async () => {
    const { root } = await mount()
    const [first, second] = nodes(root).filter((node) => node.props['aria-label'] === 'Sync now')
    expect(second.props.disabled).toBe(true)
    await click(first)
    expect(runBackendImport).toHaveBeenCalledWith('g1', 'i1', expect.anything())
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
