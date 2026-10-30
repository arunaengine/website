import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as DeviceApi from '@/lib/deviceApi'
import * as FormatCount from '@/lib/formatCount'
import * as NodePill from '@/lib/nodePill'
import * as SyncStates from '@/lib/syncStates'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, type HostNode } from '@/test/clientRender'
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

// A stat card as plain text: label, value, unit, facts and its action, each in its own block.
const CardStub = defineComponent({
  props: { label: String },
  setup: (props, { slots }) => () =>
    h('div', { 'data-card': props.label }, [
      h('p', slots.label ? slots.label() : props.label),
      h('p', [slots.value?.(), ' ', slots.unit?.()]),
      h('p', { 'data-facts': '' }, slots.default?.()),
      slots.action?.(),
    ]),
})
const MarkStub = defineComponent({ props: { label: String }, setup: (props) => () => h('i', { 'data-mark': props.label }) })
const PillStub = defineComponent({ props: { state: String }, setup: (props) => () => h('span', { 'data-pill': props.state }, props.state) })

const ThisComputer = compileClientComponent(new URL('./ThisComputer.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => Plain }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props) => () => h('h2', props.title) })),
  '@/components/ui/StatusMark.vue': moduleDefault(MarkStub),
  '@/components/ui/StatusPill.vue': moduleDefault(PillStub),
  '@/components/ui/IconTile.vue': moduleDefault(Plain),
  '@/components/dashboard/OverviewCell.vue': moduleDefault(CardStub),
  '@/components/desktop/BindFolderDialog.vue': moduleDefault(BindStub),
  '@/components/nodes/NodeNameEdit.vue': moduleDefault(NameEditStub),
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: (feature: string) => feature !== 'compute' || computeShown.value }) },
  '@/composables/useDeviceCompute': { useDeviceCompute: () => ({ compute, state: computeState, load: loadCompute }) },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ status, refresh: refreshStatus, deviceClient }) },
  '@/composables/useDeviceTransfers': { useDeviceTransfers: () => ({ all: transfers, state: transfersState, load: vi.fn(async () => undefined) }) },
  '@/composables/useSyncedFolders': { useSyncedFolders: () => ({ folders, listState: foldersState, load: loadFolders }) },
  '@/composables/useNodeNames': { useNodeNames: () => ({ renameDevice }) },
  '@/lib/deviceApi': DeviceApi,
  '@/lib/formatCount': FormatCount,
  '@/lib/nodePill': NodePill,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

const running = (): NodeStatus => ({ state: 'running', ready: true, enrolled: true, enrolling: false, uptimeSeconds: 22_320 } as NodeStatus)
// The text of a card with a space between its parts.
const spaced = (node: HostNode): string => `${node.text} ${node.children.map(spaced).join(' ')}`.replace(/\s+/g, ' ').trim()
const card = (root: HostNode, label: string) => spaced(element(root, (node) => node.props['data-card'] === label))
const syncCard = (root: HostNode) => spaced(element(root, (node) => node.tag === 'div' && content(node).startsWith('Sync activity')))

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

describe('this computer', () => {
  it('shows its state, folders, local runs and sync activity as four cards', async () => {
    folders.value = [folder()]
    transfers.value = [DeviceApi.readTransfer({ id: 't1', state: 'done', path: 'genome.fasta', key: 'genome.fasta', bucket: 'laptop', folder_id: 'f1' }, 'upload')]
    const mounted = await mountApp(ThisComputer, { props: { name: 'Microbiology laptop', connected: { count: 3, total: 3 } } })

    expect(card(mounted.root, 'Microbiology laptop')).toBe('Microbiology laptop Running Connected to 3/3 nodes Up 6 hours 12 minutes Open this computer')
    expect(card(mounted.root, 'Linked folders')).toBe('Linked folders 1 folder In sync /home/me/data-2026 to lab Link a folder')
    expect(card(mounted.root, 'Local runs')).toBe('Local runs 0 running Docker 1 job at a time Change limits')
    expect(syncCard(mounted.root)).toContain('Sync activity 0 moving now genome.fasta To laptop')
    expect(nodes(mounted.root).some((node) => node.props['data-mark'] === 'Uploaded')).toBe(true)
    await click(button(mounted.root, 'Link a folder'))
    expect(content(mounted.root)).toContain('bind-dialog-open')
    mounted.app.unmount()
  })

  it('says when files need the owner, a folder still syncs, runs are off or the computer stopped', async () => {
    folders.value = [folder({ counters: { in_sync: 1, uploading: 0, conflicts: 2, pending_replacements: 0, remote_deleted: 0, errors: 0 } }), folder({ folder_id: 'f2' })]
    compute.value = { ...docker(), enabled: false }
    let mounted = await mountApp(ThisComputer, { props: { name: 'This computer' } })
    expect(card(mounted.root, 'Linked folders')).toContain('2 folders 2 files need you')
    expect(card(mounted.root, 'Local runs')).toContain('Local runs off')
    mounted.app.unmount()

    folders.value = [folder({ state: 'binding' })]
    transfers.value = [DeviceApi.readTransfer({ id: 't1', state: 'transferring', path: 'a', folder_id: 'f1', bytes_total: 100, bytes_done: 40 }, 'upload')]
    computeShown.value = false
    mounted = await mountApp(ThisComputer, { props: { name: 'This computer' } })
    expect(card(mounted.root, 'Linked folders')).toContain('Syncing')
    expect(syncCard(mounted.root)).toContain('1 moving now')
    expect(nodes(mounted.root).some((node) => node.props['data-pill'] === 'Sending')).toBe(true)
    expect(content(mounted.root)).not.toContain('Local runs')
    mounted.app.unmount()

    status.value = { state: 'stopped', ready: false, enrolled: true, enrolling: false } as NodeStatus
    folders.value = [folder()]
    compute.value = docker()
    computeShown.value = true
    mounted = await mountApp(ThisComputer, { props: { name: 'This computer' } })
    expect(card(mounted.root, 'This computer')).toContain('Stopped Not connected to the realm')
    expect(card(mounted.root, 'Linked folders')).toContain('Waits until Aruna runs')
    expect(card(mounted.root, 'Local runs')).toContain('Off while stopped')
    expect(syncCard(mounted.root)).toContain('moving, paused')
    mounted.app.unmount()
  })

  it('says reading or unavailable instead of a zero', async () => {
    foldersState.value = 'loading'
    transfersState.value = 'offline'
    computeState.value = 'error'
    const mounted = await mountApp(ThisComputer, { props: { name: 'This computer' } })

    expect(card(mounted.root, 'Linked folders')).toContain('Linked folders Reading')
    expect(syncCard(mounted.root)).toContain('Sync activity Not available right now')
    expect(card(mounted.root, 'Local runs')).toContain('Local runs Not available right now')
    expect(content(mounted.root)).not.toMatch(/\b0 (folders|running|moving)/)
    mounted.app.unmount()
  })

  it('reads the folders and runs again on every visit, at once when the node is known', async () => {
    for (const visit of [1, 2]) {
      const mounted = await mountApp(ThisComputer, { props: { name: 'This computer' } })
      await flush()
      expect(loadCompute).toHaveBeenCalledTimes(visit)
      // A folder linked through the device API since the last read counts at once.
      expect(loadFolders).toHaveBeenCalledTimes(visit)
      mounted.app.unmount()
    }

    loadCompute.mockClear()
    refreshStatus.mockImplementation(() => new Promise(() => {}))
    deviceClient.value = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner' }
    const known = await mountApp(ThisComputer, { props: { name: 'This computer' } })
    expect(loadCompute).toHaveBeenCalledTimes(1)
    known.app.unmount()

    deviceClient.value = null
    const unknown = await mountApp(ThisComputer, { props: { name: 'This computer' } })
    expect(loadCompute).toHaveBeenCalledTimes(1)
    unknown.app.unmount()
  })

  it('renames this computer through the device route, by its node id, once the realm lists it', async () => {
    const unknown = await mountApp(ThisComputer, { props: { name: 'This computer' } })
    expect(() => button(unknown.root, 'Rename')).toThrow()
    unknown.app.unmount()

    const mounted = await mountApp(ThisComputer, { props: { name: 'Microbiology laptop', nodeId: 'dev-node-1', value: null } })
    await click(button(mounted.root, 'Rename'))
    expect(renameDevice).toHaveBeenCalledWith('dev-node-1', 'Lab laptop')
    mounted.app.unmount()
  })

  it('opens this computer and its run settings from the cards', async () => {
    const mounted = await mountApp(ThisComputer, { props: { name: 'This computer' } })
    const target = (text: string) => JSON.parse(String(element(mounted.root, (node) => node.tag === 'a' && content(node).trim() === text).props['data-to']))

    expect(target('Open this computer')).toEqual({ name: 'device' })
    expect(target('Change limits')).toEqual({ name: 'device', query: { section: 'local-runs' } })
    mounted.app.unmount()
  })
})
