import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const listGroupBackends = vi.fn()
const getGroupRouting = vi.fn()
const putGroupRouting = vi.fn()
const listBackendImports = vi.fn()
const runBackendImport = vi.fn()
const disableGroupBackend = vi.fn()
const writesDisabled = ref(false)

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
// The confirm renders only while open, like the real dialog.
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { role: 'dialog' }, slots.default?.()) : null),
})

const StorageSection = compileClientComponent(new URL('./StorageSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/groups/StorageBackendDialog.vue': moduleDefault(Empty),
  '@/components/groups/LinkedFolderDialog.vue': moduleDefault(Empty),
  '@/components/groups/DefaultRuleDialog.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({
      apiBaseUrl: ref('https://api.test'),
      authToken: ref('bearer'),
      sessionEpoch: ref(0),
      listGroupBackends,
      getGroupRouting,
      putGroupRouting,
      disableGroupBackend,
      enableGroupBackend: vi.fn(),
      saving: ref(false),
    }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
  '@/lib/api': { ...Api, listBackendImports, runBackendImport },
  '@/lib/storageRules': StorageRules,
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/utils': Utils,
})

const STORAGE = {
  backend_id: 's1',
  group_id: 'g1',
  kind: 's3',
  name: 'lab-object-store',
  public_config: {
    endpoint: 's3.lab.example.org',
    default_bucket: 'aruna-lab-default',
    'bucket:aruna-lab-default': 'created',
    'bucket:lab-raw': 'found',
    'bucket:lab-results': 'found',
  },
}
const HOURS_AGO = new Date(Date.now() - 2 * 3600_000).toISOString()
const run = (state: string, imported: number, failed = 0) => ({
  job_id: 'j',
  state,
  started_at: HOURS_AGO,
  imported,
  skipped: 0,
  failed,
  errors: failed ? [{ key: 'lab-results/a.csv', error: 'No access to bucket lab-results' }] : [],
})
const link = (id: string, bucket: string, keyPrefix: string, prefix: string, lastRun: unknown) => ({
  import_id: id,
  backend_id: 's1',
  backend_prefix: prefix,
  bucket,
  key_prefix: keyPrefix,
  created_at: '',
  last_run: lastRun,
})
const LINKS = [
  link('i1', 'sequencing', '', 'lab-raw/2024/', run('succeeded', 5)),
  link('i2', 'results', '', 'lab-results/', run('succeeded', 1, 3)),
  link('i3', 'imaging', 'raw/', 'lab-imaging/', run('ready', 312)),
  link('i4', 'archive', 'old/', 'lab-archive/', null),
  link('i6', 'denied', '', 'lab-denied/', run('failed', 0, 1)),
]

async function mount() {
  const mounted = await mountApp(
    defineComponent(() => () => h(StorageSection, { groupId: 'g1', groupName: 'lab', canAdmin: true })),
  )
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

function row(root: Parameters<typeof content>[0], id: string) {
  return element(root, (node) => node.props['data-testid'] === 'linked-row' && content(node).includes(id))
}

beforeEach(() => {
  vi.clearAllMocks()
  writesDisabled.value = false
  listGroupBackends.mockResolvedValue({ backends: [STORAGE] })
  getGroupRouting.mockResolvedValue({ group_id: 'g1', default_target: { backend_id: 's1' }, warnings: [] })
  listBackendImports.mockResolvedValue(LINKS)
  putGroupRouting.mockResolvedValue({ group_id: 'g1', warnings: [] })
  runBackendImport.mockResolvedValue({ job_id: 'j2' })
})

describe('StorageSection', () => {
  it('lists Aruna storage and the rules of each storage', async () => {
    const mounted = await mount()
    const text = content(mounted.root)
    expect(text).toContain('Aruna storage')
    expect(text).toContain('Your S3 storage · s3.lab.example.org')
    for (const heading of ['In Aruna', 'In lab-object-store', 'Last run']) expect(text).toContain(heading)

    const defaultRow = element(mounted.root, (node) => node.props['data-testid'] === 'default-row')
    expect(content(defaultRow)).toContain('All buckets')
    expect(content(defaultRow)).toContain('aruna-lab-default')
    expect(element(defaultRow, (node) => node.props.title === 'Bucket created')).toBeTruthy()

    expect(content(row(mounted.root, 'sequencing'))).toContain('sequencing (whole bucket)')
    expect(content(row(mounted.root, 'sequencing'))).toContain('lab-raw / 2024/')
    expect(content(row(mounted.root, 'sequencing'))).toContain('Synced 2h ago')
    expect(element(row(mounted.root, 'sequencing'), (node) => node.props.title === 'Bucket found')).toBeTruthy()
    expect(content(row(mounted.root, 'results'))).toContain('3 failed · 2h ago')
    // Item failures stay in Last run; the bucket itself was found.
    expect(element(row(mounted.root, 'results'), (node) => node.props.title === 'Bucket found')).toBeTruthy()
    expect(content(row(mounted.root, 'results'))).not.toContain('✗')
    expect(content(row(mounted.root, 'denied'))).toContain('✗')
    expect(element(row(mounted.root, 'denied'), (node) => node.props.title === 'No access to bucket lab-results')).toBeTruthy()
    expect(content(row(mounted.root, 'imaging'))).toContain('imaging / raw/')
    expect(content(row(mounted.root, 'imaging'))).toContain('Running… 312 added')
    expect(button(row(mounted.root, 'imaging'), 'Run now').props.disabled).toBe(true)
    expect(content(row(mounted.root, 'archive'))).toContain('Never run')
    mounted.app.unmount()
  })

  it('shows the failures of the last run', async () => {
    const mounted = await mount()
    expect(content(mounted.root)).not.toContain('lab-results/a.csv')
    await click(button(row(mounted.root, 'results'), '3 failed'))
    expect(content(mounted.root)).toContain('lab-results/a.csv: No access to bucket lab-results')
    mounted.app.unmount()
  })

  it('asks before Aruna storage becomes the default again', async () => {
    const mounted = await mount()
    const aruna = element(mounted.root, (node) => node.props['data-testid'] === 'aruna-storage')
    await click(button(aruna, 'Use as default'))
    const dialog = element(mounted.root, (node) => node.props.role === 'dialog')
    expect(content(dialog)).toContain(
      'The default rule of lab-object-store is removed. Files already in lab-object-store stay there.',
    )
    await click(button(dialog, 'Use as default'))
    expect(putGroupRouting).toHaveBeenCalledWith('g1', null)
    mounted.app.unmount()
  })

  it('starts a run of a linked rule', async () => {
    const mounted = await mount()
    await click(button(row(mounted.root, 'sequencing'), 'Run now'))
    expect(runBackendImport).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    mounted.app.unmount()
  })

  it('shows where new uploads go when that is elsewhere', async () => {
    const moved = { ...link('i5', 'uploads', '', 'lab-raw/in/', null), write_prefix: 'lab-new/up/' }
    listBackendImports.mockResolvedValue([moved])
    const mounted = await mount()
    const line = element(mounted.root, (node) => node.props['data-testid'] === 'write-line')
    expect(content(line)).toContain('New uploads go to lab-object-store: lab-new / up/')
    expect(content(row(mounted.root, 'uploads'))).toContain('←')
    mounted.app.unmount()
  })

  it('keeps the remove confirmation closed for writes while offline', async () => {
    const mounted = await mount()
    const card = element(mounted.root, (node) => node.props['data-testid'] === 'storage-s1')
    await click(button(card, 'Remove'))
    writesDisabled.value = true
    await flush()
    const confirm = button(card, 'Remove')
    expect(confirm.props.disabled).toBe(true)
    await click(confirm)
    expect(disableGroupBackend).not.toHaveBeenCalled()
    mounted.app.unmount()
  })
})
