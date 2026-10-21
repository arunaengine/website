import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const listGroupBackends = vi.fn()
const getGroupRouting = vi.fn()
const putGroupRouting = vi.fn()
const listBackendImports = vi.fn()
const runBackendImport = vi.fn()
const getBucketMove = vi.fn()
const startBucketMove = vi.fn()
const listGroupBuckets = vi.fn()
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

const CardStub = defineComponent({
  props: { link: Object, highlight: Boolean, running: Boolean, writeTo: String },
  emits: ['run', 'edit'],
  setup: (props, { emit }) => () =>
    h('div', { 'data-testid': 'link-card', 'data-link': (props.link as { import_id: string }).import_id, 'data-highlight': String(props.highlight), 'data-write': props.writeTo ?? '' }, [
      h('button', { onClick: () => emit('run') }, 'Run now'),
      h('button', { onClick: () => emit('edit') }, 'Edit'),
    ]),
})

const SaveStub = defineComponent({
  emits: ['saved'],
  setup: (_, { emit }) => () => h('i', { 'data-testid': 'save-default', onClick: () => emit('saved', true) }),
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
  '@/components/ui/Progress.vue': moduleDefault(Empty),
  '@/components/groups/StorageBackendDialog.vue': moduleDefault(Empty),
  '@/components/groups/LinkedFolderDialog.vue': moduleDefault(Empty),
  '@/components/storage/LinkedFolderCard.vue': moduleDefault(CardStub),
  '@/components/groups/DefaultRuleDialog.vue': moduleDefault(SaveStub),
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
  '@/lib/api': { ...Api, listBackendImports, runBackendImport, getBucketMove, startBucketMove, listGroupBuckets },
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
  link('i7', 'unlisted', '', 'lab-unlisted/', { ...run('failed', 0), error: 'Bucket lab-unlisted not found' }),
]

async function mount() {
  const mounted = await mountApp(
    defineComponent(() => () => h(StorageSection, { groupId: 'g1', groupName: 'lab', canAdmin: true })),
  )
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

function card(root: Parameters<typeof content>[0], id: string) {
  return element(root, (node) => node.props['data-testid'] === 'link-card' && node.props['data-link'] === id)
}

beforeEach(() => {
  vi.clearAllMocks()
  writesDisabled.value = false
  listGroupBackends.mockResolvedValue({ backends: [STORAGE] })
  getGroupRouting.mockResolvedValue({ group_id: 'g1', default_target: { backend_id: 's1' }, warnings: [] })
  listBackendImports.mockResolvedValue(LINKS)
  putGroupRouting.mockResolvedValue({ group_id: 'g1', warnings: [] })
  runBackendImport.mockResolvedValue({ job_id: 'j2' })
  listGroupBuckets.mockResolvedValue([])
  getBucketMove.mockResolvedValue({ bucket: 'x', misplaced: 0, complete: true })
  startBucketMove.mockResolvedValue({})
})

function labelled(root: Parameters<typeof content>[0], label: string) {
  return element(root, (node) => node.tag === 'button' && node.props['aria-label'] === label)
}
function hasLabel(root: Parameters<typeof content>[0], label: string) {
  try {
    labelled(root, label)
    return true
  } catch {
    return false
  }
}

describe('StorageSection', () => {
  it('lists Aruna storage and the rules of each storage', async () => {
    const mounted = await mount()
    const text = content(mounted.root)
    expect(text).toContain('Aruna storage')
    expect(text).toContain('Your S3 storage · s3.lab.example.org')
    
    const defaultRow = element(mounted.root, (node) => node.props['data-testid'] === 'default-row')
    expect(content(defaultRow)).toContain('All buckets')
    expect(content(defaultRow)).toContain('aruna-lab-default')
    expect(element(defaultRow, (node) => node.props.title === 'Bucket created')).toBeTruthy()

    expect(card(mounted.root, 'i4')).toBeTruthy()
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

  it('shows each linked bucket as a card under its storage and runs it from there', async () => {
    const mounted = await mount()
    const cards = nodes(mounted.root).filter((node) => node.props['data-testid'] === 'link-card')
    expect(cards.map((card) => card.props['data-link'])).toEqual(LINKS.map((entry) => entry.import_id))
    await click(button(card(mounted.root, 'i1'), 'Run now'))
    expect(runBackendImport).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    mounted.app.unmount()
  })

  it('passes the place new uploads go to when a link writes elsewhere', async () => {
    const moved = { ...link('i5', 'uploads', '', 'lab-raw/in/', null), write_prefix: 'lab-new/up/' }
    listBackendImports.mockResolvedValue([moved, link('i6', 'plain', '', 'lab-raw/p/', null)])
    const mounted = await mount()
    expect(card(mounted.root, 'i5').props['data-write']).toBe('lab-object-store: lab-new / up/')
    expect(card(mounted.root, 'i6').props['data-write']).toBe('')
    mounted.app.unmount()
  })

  it('marks the card a link opened from the bucket points at', async () => {
    const mounted = await mountApp(
      defineComponent(() => () => h(StorageSection, { groupId: 'g1', groupName: 'lab', canAdmin: true, focusLink: 'i2' })),
    )
    await flush()
    expect(card(mounted.root, 'i1').props['data-highlight']).toBe('false')
    expect(card(mounted.root, 'i2').props['data-highlight']).toBe('true')
    mounted.app.unmount()
  })

  it('moves all buckets of the group from the default row', async () => {
    listGroupBuckets.mockResolvedValue(['alpha', 'beta'])
    getBucketMove.mockImplementation(async (bucket: string) => ({
      bucket,
      misplaced: bucket === 'alpha' ? 3 : 0,
      complete: true,
    }))
    const mounted = await mount()
    const defaultRow = element(mounted.root, (node) => node.props['data-testid'] === 'default-row')
    await click(labelled(defaultRow, 'Move files'))
    await click(button(element(mounted.root, (node) => node.props.role === 'dialog'), 'Move files'))
    expect(startBucketMove).toHaveBeenCalledTimes(1)
    expect(startBucketMove).toHaveBeenCalledWith('alpha', '', expect.anything())
    mounted.app.unmount()
  })

  it('keeps the default row free of moves started for a linked folder', async () => {
    listGroupBuckets.mockResolvedValue(['imaging'])
    getBucketMove.mockResolvedValue({
      bucket: 'imaging',
      misplaced: 10,
      complete: true,
      move_prefix: 'raw/',
      progress: { migrated: 5, skipped: 0, failed: 0, started_at_ms: 1, finished_at_ms: null },
    })
    const mounted = await mount()
    const defaultRow = element(mounted.root, (node) => node.props['data-testid'] === 'default-row')
    expect(labelled(defaultRow, 'Move files').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('offers Move files on the Aruna card when Aruna is the default', async () => {
    getGroupRouting.mockResolvedValue({ group_id: 'g1', warnings: [] })
    listGroupBuckets.mockResolvedValue(['alpha'])
    getBucketMove.mockImplementation(async (bucket: string) => ({ bucket, misplaced: bucket === 'alpha' ? 2 : 0, complete: true }))
    const mounted = await mount()
    const aruna = element(mounted.root, (node) => node.props['data-testid'] === 'aruna-storage')
    await click(labelled(aruna, 'Move files'))
    await click(button(element(mounted.root, (node) => node.props.role === 'dialog'), 'Move files'))
    expect(startBucketMove).toHaveBeenCalledWith('alpha', '', expect.anything())
    mounted.app.unmount()
  })

  it('keeps a running move in view when the status read fails', async () => {
    listGroupBuckets.mockResolvedValue(['alpha'])
    let served = false
    getBucketMove.mockImplementation(async (bucket: string) => {
      if (bucket === 'alpha' && !served) {
        served = true
        return {
          bucket, misplaced: 5, complete: true,
          progress: { migrated: 1, skipped: 0, failed: 0, started_at_ms: 1, finished_at_ms: null },
        }
      }
      throw new Error('down')
    })
    const mounted = await mount()
    expect(content(mounted.root)).toContain('Moving files')
    mounted.app.unmount()
  })

  it('counts up with a fixed total while the saved progress stays 0', async () => {
    listGroupBuckets.mockResolvedValue(['alpha'])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let state = { misplaced: 100, migrated: 0 }
      getBucketMove.mockImplementation(async () => ({
        bucket: 'x', misplaced: state.misplaced, complete: true,
        progress: { migrated: state.migrated, skipped: 5, failed: 0, started_at_ms: 1, finished_at_ms: null },
      }))
      const mounted = await mount()
      expect(content(mounted.root)).toContain('Moving files: 0 of 100')
      const seen = []
      for (state of [{ misplaced: 99, migrated: 0 }, { misplaced: 70, migrated: 0 }, { misplaced: 36, migrated: 64 }]) {
        await vi.advanceTimersByTimeAsync(3_000)
        await flush()
        seen.push(/Moving files: [\d,]+ of [\d,]+/.exec(content(mounted.root))?.[0])
      }
      expect(seen).toEqual(['Moving files: 1 of 100', 'Moving files: 30 of 100', 'Moving files: 64 of 100'])
      mounted.app.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps progress and polls again after a failed later poll', async () => {
    listGroupBuckets.mockResolvedValue(['alpha'])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      getBucketMove.mockResolvedValue({
        bucket: 'x', misplaced: 5, complete: true,
        progress: { migrated: 1, skipped: 0, failed: 0, started_at_ms: 1, finished_at_ms: null },
      })
      const mounted = await mount()
      listBackendImports.mockRejectedValueOnce(new Error('down'))
      await vi.advanceTimersByTimeAsync(3_000)
      await flush()
      expect(content(mounted.root)).toContain('Moving files')
      expect(content(mounted.root)).toContain('lab-object-store')
      const calls = listBackendImports.mock.calls.length
      await vi.advanceTimersByTimeAsync(3_000)
      expect(listBackendImports.mock.calls.length).toBeGreaterThan(calls)
      mounted.app.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens no confirmation when it goes offline during the recount', async () => {
    listGroupBuckets.mockResolvedValue(['alpha'])
    const mounted = await mount()
    let release: (value: unknown) => void = () => {}
    const gate = new Promise((resolve) => (release = resolve))
    getBucketMove.mockImplementation(async () => {
      await gate
      return { bucket: 'alpha', misplaced: 3, complete: true }
    })
    await click(element(mounted.root, (node) => node.props['data-testid'] === 'save-default'))
    await flush()
    writesDisabled.value = true
    release(null)
    await flush()
    await flush()
    expect(() => element(mounted.root, (node) => node.props.role === 'dialog')).toThrow()
    expect(startBucketMove).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('sends no move while offline', async () => {
    listGroupBuckets.mockResolvedValue(['alpha'])
    getBucketMove.mockResolvedValue({ bucket: 'x', misplaced: 7, complete: true })
    const mounted = await mount()
    const defaultRow = element(mounted.root, (node) => node.props['data-testid'] === 'default-row')
    await click(labelled(defaultRow, 'Move files'))
    writesDisabled.value = true
    await flush()
    await click(button(element(mounted.root, (node) => node.props.role === 'dialog'), 'Move files'))
    expect(startBucketMove).not.toHaveBeenCalled()
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
