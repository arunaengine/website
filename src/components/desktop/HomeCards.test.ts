import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ActivityGroups from '@/lib/activityGroups'
import * as DeviceApi from '@/lib/deviceApi'
import * as NodePill from '@/lib/nodePill'
import * as SyncStates from '@/lib/syncStates'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, moduleDefault, mountApp, type HostNode } from '@/test/clientRender'
import type { DeviceCompute, DeviceTransfer, SyncedFolder } from '@/lib/deviceApi'
import type { NodeStatus } from '@/lib/desktopBridge'

const status = ref<NodeStatus | null>(null)
const nodeState = ref('running')
const folders = ref<SyncedFolder[]>([])
const foldersState = ref('ready')
const transfers = ref<DeviceTransfer[]>([])
const transfersState = ref('ready')
const compute = ref<DeviceCompute | null>(null)
const computeState = ref('ready')
const computeShown = ref(true)
const credentials = ref<Array<{ access_key_id: string; status: string }>>([])
const keysState = ref('ready')
const startHidden = ref(false)

function folder(overrides: Partial<SyncedFolder> = {}): SyncedFolder {
  return {
    folder_id: 'f1',
    root: '/home/me/data-2026',
    local_bucket: 'dev-data',
    group_id: 'g1',
    remote: { node_id: 'n1', bucket: 'lab', prefix: 'raw/' },
    mode: 'two_way',
    propagate_deletes: true,
    state: 'active',
    counters: { in_sync: 4, uploading: 0, conflicts: 2, pending_replacements: 0, remote_deleted: 0, errors: 0 },
    last_reconcile_ms: null,
    created_at_ms: null,
    message: null,
    ...overrides,
  }
}

function enabledCompute(): DeviceCompute {
  return {
    enabled: true,
    backend: 'docker',
    healthy: true,
    limits: { max_cpu_cores: null, max_ram_bytes: null, max_disk_bytes: null, max_concurrent: 1 },
    running: 1,
    queued: 0,
    paused: false,
    message: null,
  }
}

// Renders where a link points, so the steps' destinations are testable.
const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const Plain = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const BindStub = defineComponent({
  props: { open: Boolean },
  setup: (props) => () => h('div', props.open ? 'bind-dialog-open' : ''),
})

const HomeCards = compileClientComponent(new URL('./HomeCards.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@vueuse/core': { useLocalStorage: () => startHidden },
  '@lucide/vue': new Proxy({}, { get: () => Plain }),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Plain),
  '@/components/ui/Progress.vue': moduleDefault(Plain),
  '@/components/desktop/BindFolderDialog.vue': moduleDefault(BindStub),
  '@/composables/usePortalFeatures': {
    usePortalFeatures: () => ({ shown: (feature: string) => feature !== 'compute' || computeShown.value }),
  },
  '@/composables/useDeviceCompute': {
    useDeviceCompute: () => ({ compute, state: computeState, ensureLoaded: vi.fn(async () => undefined) }),
  },
  '@/composables/useDeviceKeys': {
    useDeviceKeys: () => ({
      active: computed(() => credentials.value.filter((key) => key.status === 'active')),
      state: keysState,
    }),
  },
  '@/composables/useDeviceStatus': {
    useDeviceStatus: () => ({ status, state: nodeState, refresh: vi.fn(async () => undefined) }),
  },
  '@/composables/useDeviceTransfers': {
    useDeviceTransfers: () => ({ all: transfers, state: transfersState, load: vi.fn(async () => undefined) }),
  },
  '@/composables/useNodeControl': {
    useNodeControl: () => ({ busy: ref(false), error: ref(null), start: vi.fn() }),
  },
  '@/composables/useSyncedFolders': {
    useSyncedFolders: () => ({
      folders,
      listState: foldersState,
      ensureLoaded: vi.fn(async () => undefined),
      load: vi.fn(async () => undefined),
    }),
  },
  '@/lib/activityGroups': ActivityGroups,
  '@/lib/deviceApi': DeviceApi,
  '@/lib/keyNames': { keyNames: () => ({ AK1: 'Laptop tools' }) },
  '@/lib/nodePill': NodePill,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

function step(root: HostNode, title: string): HostNode {
  return element(root, (node) => node.tag === 'li' && content(node).includes(title))
}

function link(root: HostNode, label: string): Record<string, unknown> {
  const found = element(root, (node) => node.tag === 'a' && content(node).trim() === label)
  return JSON.parse(String(found.props['data-to']))
}

beforeEach(() => {
  status.value = null
  nodeState.value = 'running'
  folders.value = []
  foldersState.value = 'ready'
  transfers.value = []
  transfersState.value = 'ready'
  compute.value = { ...enabledCompute(), enabled: false }
  computeState.value = 'ready'
  computeShown.value = true
  credentials.value = []
  keysState.value = 'ready'
  startHidden.value = false
})

describe('desktop home cards', () => {
  it('gives every open step a button that leads to its action', async () => {
    const mounted = await mountApp(HomeCards)

    expect(content(mounted.root)).toContain('0 of 3 done')
    expect(link(step(mounted.root, 'Connect your tools'), 'Create a key')).toEqual({
      name: 'settings',
      query: { tab: 'access', create: 'key' },
    })
    expect(link(step(mounted.root, 'Run jobs on this computer'), 'Turn on')).toEqual({
      name: 'device',
      query: { section: 'local-runs' },
    })
    expect(content(mounted.root)).not.toContain('bind-dialog-open')
    await click(element(step(mounted.root, 'Keep a folder'), (node) => node.tag === 'button'))
    expect(content(mounted.root)).toContain('bind-dialog-open')
    mounted.app.unmount()
  })

  it('marks steps done only on what the node reported', async () => {
    folders.value = [folder()]
    credentials.value = [{ access_key_id: 'AK1', status: 'active' }]
    const mounted = await mountApp(HomeCards)
    const text = content(mounted.root)

    expect(text).toContain('2 of 3 done')
    expect(text).toContain('data-2026 is linked.')
    expect(text).toContain('Key "Laptop tools" is ready.')
    expect(() => link(step(mounted.root, 'Connect your tools'), 'Create a key')).toThrow()
    mounted.app.unmount()
  })

  it('drops the list once every step is done or while a list is still read', async () => {
    folders.value = [folder()]
    credentials.value = [{ access_key_id: 'AK1', status: 'active' }]
    compute.value = enabledCompute()
    let mounted = await mountApp(HomeCards)
    expect(content(mounted.root)).not.toContain('Get started')
    mounted.app.unmount()

    folders.value = []
    keysState.value = 'loading'
    mounted = await mountApp(HomeCards)
    expect(content(mounted.root)).not.toContain('Get started')
    mounted.app.unmount()
  })

  it('leaves out the runs step and tile while compute is hidden', async () => {
    computeShown.value = false
    const mounted = await mountApp(HomeCards)

    expect(content(mounted.root)).toContain('0 of 2 done')
    expect(content(mounted.root)).not.toContain('Local runs')
    mounted.app.unmount()
  })

  it('sums this computer up from the node', async () => {
    folders.value = [folder()]
    compute.value = enabledCompute()
    transfers.value = [DeviceApi.readTransfer({ id: 't1', state: 'transferring', path: 'a', folder_id: 'f1', bytes_total: 100, bytes_done: 40 }, 'upload')]
    const mounted = await mountApp(HomeCards)
    const text = content(mounted.root)

    expect(text).toContain('2 files need you')
    expect(text).toContain('1 file')
    expect(text).toContain('40 B of 100 B')
    expect(text).toContain('1 running')
    expect(text).toContain('docker, 1 job at a time')
    await click(button(mounted.root, 'Link a local folder'))
    expect(content(mounted.root)).toContain('bind-dialog-open')
    mounted.app.unmount()
  })

  it('says reading or unavailable instead of a zero', async () => {
    foldersState.value = 'loading'
    transfersState.value = 'offline'
    computeState.value = 'error'
    const mounted = await mountApp(HomeCards)
    const text = content(mounted.root)

    expect(text).toContain('Reading…')
    expect(text).toContain('Not available right now')
    expect(text).not.toContain('0 files')
    mounted.app.unmount()
  })
})
