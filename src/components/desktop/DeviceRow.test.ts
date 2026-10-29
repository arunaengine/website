import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as DeviceApi from '@/lib/deviceApi'
import * as FormatCount from '@/lib/formatCount'
import * as NodePill from '@/lib/nodePill'
import * as SyncStates from '@/lib/syncStates'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import type { DeviceCompute, DeviceTransfer, SyncedFolder } from '@/lib/deviceApi'
import type { NodeStatus } from '@/lib/desktopBridge'

const status = ref<NodeStatus | null>(null)
const folders = ref<SyncedFolder[]>([])
const foldersState = ref('ready')
const transfers = ref<DeviceTransfer[]>([])
const transfersState = ref('ready')
const compute = ref<DeviceCompute | null>(null)
const computeState = ref('ready')
const computeShown = ref(true)
const loadCompute = vi.fn(async () => undefined)
const loadFolders = vi.fn(async () => undefined)
const refreshStatus = vi.fn(async (): Promise<void> => undefined)
const deviceClient = ref<{ baseUrl: string; token: string } | null>(null)

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
    counters: { in_sync: 4, uploading: 0, conflicts: 0, pending_replacements: 0, remote_deleted: 0, errors: 0 },
    last_reconcile_ms: null,
    created_at_ms: null,
    message: null,
    ...overrides,
  }
}

const docker = (): DeviceCompute => ({
  enabled: true,
  backend: 'docker',
  healthy: true,
  limits: { max_cpu_cores: null, max_ram_bytes: null, max_disk_bytes: null, max_concurrent: 1 },
  running: 0,
  queued: 0,
  paused: false,
  message: null,
})

const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
const Plain = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
const renameDevice = vi.fn(async () => undefined)
// Shows the name it wraps and saves a fixed new one, to see which route the row hands it.
const NameEditStub = defineComponent({
  props: { name: String, save: Function },
  setup: (props, { slots }) => () => h('span', [slots.default?.(), h('button', { onClick: () => (props.save as (name: string) => Promise<void>)('Lab laptop') }, 'Rename')]),
})
const BindStub = defineComponent({ props: { open: Boolean }, setup: (props) => () => h('div', props.open ? 'bind-dialog-open' : '') })

const DeviceRow = compileClientComponent(new URL('./DeviceRow.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => Plain }),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/desktop/BindFolderDialog.vue': moduleDefault(BindStub),
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: (feature: string) => feature !== 'compute' || computeShown.value }) },
  '@/composables/useDeviceCompute': { useDeviceCompute: () => ({ compute, state: computeState, load: loadCompute }) },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ status, refresh: refreshStatus, deviceClient }) },
  '@/composables/useDeviceTransfers': { useDeviceTransfers: () => ({ all: transfers, state: transfersState, load: vi.fn(async () => undefined) }) },
  '@/composables/useSyncedFolders': { useSyncedFolders: () => ({ folders, listState: foldersState, load: loadFolders }) },
  '@/composables/useRealmNodes': { THIS_COMPUTER: 'This computer' },
  '@/composables/useNodeNames': { useNodeNames: () => ({ renameDevice }) },
  '@/components/nodes/NodeNameEdit.vue': moduleDefault(NameEditStub),
  '@/lib/deviceApi': DeviceApi,
  '@/lib/formatCount': FormatCount,
  '@/lib/nodePill': NodePill,
  '@/lib/syncStates': SyncStates,
})

const running = (): NodeStatus => ({ state: 'running', ready: true, enrolled: true, enrolling: false } as NodeStatus)

beforeEach(() => {
  status.value = running()
  folders.value = []
  foldersState.value = 'ready'
  transfers.value = []
  transfersState.value = 'ready'
  compute.value = docker()
  computeState.value = 'ready'
  computeShown.value = true
  loadCompute.mockClear()
  loadFolders.mockClear()
  refreshStatus.mockReset().mockResolvedValue(undefined)
  deviceClient.value = null
})

describe('device row', () => {
  it('names this computer once, says it is online and what it does, in one row', async () => {
    folders.value = [folder()]
    const mounted = await mountApp(DeviceRow, { props: { name: 'Microbiology laptop' } })
    const text = content(mounted.root)

    expect(text).toContain('Microbiology laptopthis computeronline')
    expect(text).toContain('1 linked folder, in sync|0 files moving|0 runs running here|Docker, 1 at a time')
    expect(text).not.toContain('Running')
    await click(button(mounted.root, 'Link a folder'))
    expect(content(mounted.root)).toContain('bind-dialog-open')
    mounted.app.unmount()
  })

  it('gives a computer without its own name no badge that says the same', async () => {
    const mounted = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    expect(content(mounted.root).match(/this computer/gi)).toHaveLength(1)
    mounted.app.unmount()
  })

  it('says when files need the owner, a folder still syncs or runs are off', async () => {
    folders.value = [folder({ counters: { in_sync: 1, uploading: 0, conflicts: 2, pending_replacements: 0, remote_deleted: 0, errors: 0 } }), folder({ folder_id: 'f2' })]
    compute.value = { ...docker(), enabled: false }
    let mounted = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    expect(content(mounted.root)).toContain('2 linked folders, 2 files need you')
    expect(content(mounted.root)).toContain('Local runs off')
    mounted.app.unmount()

    folders.value = [folder({ state: 'binding' })]
    transfers.value = [DeviceApi.readTransfer({ id: 't1', state: 'transferring', path: 'a', folder_id: 'f1', bytes_total: 100, bytes_done: 40 }, 'upload')]
    computeShown.value = false
    mounted = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    expect(content(mounted.root)).toContain('1 linked folder, syncing|1 file moving')
    expect(content(mounted.root)).not.toContain('running here')
    mounted.app.unmount()
  })

  it('says reading or unavailable instead of a zero', async () => {
    foldersState.value = 'loading'
    transfersState.value = 'offline'
    computeState.value = 'error'
    const mounted = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    const text = content(mounted.root)

    expect(text).toContain('Linked folders reading')
    expect(text).toContain('Transfers not available right now')
    expect(text).toContain('Local runs not available right now')
    expect(text).not.toContain('0 files')
    mounted.app.unmount()
  })

  it('reads the folders and runs again on every visit, at once when the node is known', async () => {
    for (const visit of [1, 2]) {
      const mounted = await mountApp(DeviceRow, { props: { name: 'This computer' } })
      await flush()
      expect(loadCompute).toHaveBeenCalledTimes(visit)
      // A folder linked through the device API since the last read counts at once.
      expect(loadFolders).toHaveBeenCalledTimes(visit)
      mounted.app.unmount()
    }

    loadCompute.mockClear()
    refreshStatus.mockImplementation(() => new Promise(() => {}))
    deviceClient.value = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner' }
    const known = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    expect(loadCompute).toHaveBeenCalledTimes(1)
    known.app.unmount()

    deviceClient.value = null
    const unknown = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    expect(loadCompute).toHaveBeenCalledTimes(1)
    unknown.app.unmount()
  })

  it('renames this computer through the device route, by its node id, once the realm lists it', async () => {
    const unknown = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    expect(() => button(unknown.root, 'Rename')).toThrow()
    unknown.app.unmount()

    const mounted = await mountApp(DeviceRow, { props: { name: 'Microbiology laptop', nodeId: 'dev-node-1', value: null } })
    await click(button(mounted.root, 'Rename'))
    expect(renameDevice).toHaveBeenCalledWith('dev-node-1', 'Lab laptop')
    mounted.app.unmount()
  })

  it('links each count to its place on the device page and the runtime to the run settings', async () => {
    folders.value = [folder()]
    compute.value = { ...docker(), running: 2, limits: { ...docker().limits, max_concurrent: 4 } }
    const mounted = await mountApp(DeviceRow, { props: { name: 'This computer' } })
    const target = (text: string) => JSON.parse(String(element(mounted.root, (node) => node.tag === 'a' && content(node) === text).props['data-to']))

    expect(target('1 linked folder, in sync')).toEqual({ name: 'device', query: { section: 'folders' } })
    expect(target('0 files moving')).toEqual({ name: 'device', query: { section: 'activity' } })
    expect(target('Docker, 4 at a time')).toEqual({ name: 'device', query: { section: 'local-runs' } })
    // The count of running runs is a fact on its own, with no place to open.
    expect(content(mounted.root)).toContain('2 runs running here')
    expect(nodes(mounted.root).some((node) => node.tag === 'a' && content(node) === '2 runs running here')).toBe(false)
    mounted.app.unmount()
  })
})
