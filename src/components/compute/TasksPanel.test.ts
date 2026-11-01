import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, type HostNode } from '@/test/clientRender'

const desktopMode = ref(true)
const listTasks = vi.fn()
const push = vi.fn()
const metadataAtPath = vi.fn()
const getRun = vi.fn()
const route: { name: string; params: Record<string, string> } = { name: 'compute', params: {} }
const DetailStub = defineComponent({
  props: { taskId: String, apiBase: String },
  setup: (props) => () => h('aside', `detail ${props.taskId} at ${props.apiBase ?? 'serving node'}`),
})
const realmNodes = ref<Array<{ name: string; nodeId?: string; isLocal: boolean; apiBase: string | null; kind?: string }>>([])

const Plain = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const Empty = defineComponent(() => () => null)
// Like ListShell: the empty state shows only its title and actions, no tools.
const ShellStub = defineComponent({
  props: { state: String, emptyTitle: String },
  setup: (props, { slots }) => () =>
    props.state === 'empty'
      ? h('div', [props.emptyTitle, slots['empty-actions']?.()])
      : h('div', [slots.filters?.(), slots.tools?.(), slots.default?.(), slots.footer?.()]),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', { value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const IconButtonStub = defineComponent({
  props: { label: String },
  setup: (props, { attrs }) => () => h('button', { ...attrs, 'aria-label': props.label }),
})
const CellStub = defineComponent({
  props: { label: String },
  setup: (props, { slots }) => () => h('section', [props.label, ' ', slots.value?.(), ' ', slots.default?.()]),
})
// Each option is a button "label count" that toggles it, like a checkbox in the menu.
const FilterMenuStub = defineComponent({
  props: { label: String, options: Array, modelValue: Array },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('span', (props.options as Array<{ value: string; label: string; count: number }>).map((option) =>
    h('button', {
      onClick: () => emit('update:modelValue', (props.modelValue as string[]).includes(option.value)
        ? (props.modelValue as string[]).filter((value) => value !== option.value)
        : [...(props.modelValue as string[]), option.value]),
    }, `${option.label} ${option.count}`))),
})
const FilterChips = compileClientComponent(new URL('../ui/FilterChips.vue', import.meta.url), { vue: VueRuntime })

const TasksPanel = compileClientComponent(new URL('./TasksPanel.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': {
    RouterLink: Plain,
    useRoute: () => route,
    useRouter: () => ({ push }),
  },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Plain),
  '@/components/ui/EmptyState.vue': moduleDefault(Plain),
  '@/components/ui/Notice.vue': moduleDefault(Plain),
  '@/components/ui/RefreshButton.vue': moduleDefault(Empty),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/dashboard/OverviewCell.vue': moduleDefault(CellStub),
  '@/components/ui/FilterChips.vue': moduleDefault(FilterChips),
  '@/components/ui/ListShell.vue': moduleDefault(ShellStub),
  '@/components/ui/ListSkeleton.vue': moduleDefault(Empty),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/compute/FilterMenu.vue': moduleDefault(FilterMenuStub),
  '@/components/compute/KindTile.vue': moduleDefault(Empty),
  '@/components/ui/SectionHeading.vue': moduleDefault(Empty),
  '@/components/ui/StatusPill.vue': moduleDefault(Empty),
  '@/components/compute/TaskDetailPanel.vue': moduleDefault(DetailStub),
  '@/components/compute/NewRunMenu.vue': moduleDefault(Empty),
  '@/composables/useTes': {
    useTes: () => ({ getTesServiceInfo: async () => ({ type: { version: '1.1' } }), listTasks }),
    isTesUnsupported: () => false,
  },
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser: ref({ id: 'u1' }), myGroups: ref([]), metadataAtPath, getRun }),
  },
  '@/composables/useAuth': { useAuth: () => ({ authPending: ref(false) }) },
  '@/composables/useNow': { useNow: () => ref(Date.now()) },
  '@/composables/useRefresh': { useRefresh: (run: () => unknown) => ({ busy: ref(false), refresh: run }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: realmNodes,
      targets: computed(() => realmNodes.value.filter((node) => node.kind !== 'user')),
      localNodeId: ref('node-1'),
      displayName: (id: string) => `name of ${id}`,
    }),
  },
  '@/composables/useFirstPaint': { useFirstPaint: (ready: () => boolean) => computed(ready) },
  '@/lib/utils': Utils,
  '@/lib/poll': { follow: () => () => {}, onWake: () => () => {} },
  '@/lib/notebook/submit': { sessionRuntime: (tags?: Record<string, string>) => tags?.session ?? null },
  '@/lib/notebook/runtimes': { sessionRuntimeById: (id: string) => (id === 'python' ? { label: 'Python' } : undefined) },
  '@/lib/desktop': { isDesktop: () => desktopMode.value },
  '@/lib/tes': Tes,
})

const created = new Date().toISOString()
const localRun = { id: 'J1', name: 'qc-sample42', state: 'RUNNING', creation_time: created, tags: { [Tes.TES_JOB_ID_TAG]: 'J1' } }
const realmRun = {
  id: 'J2',
  name: 'assemble-run-17',
  state: 'COMPLETE',
  creation_time: created,
  tags: { [Tes.TES_JOB_ID_TAG]: 'J2', [Tes.TES_LOGICAL_STATE_TAG]: 'succeeded' },
}

function rows(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'tr' && !content(node).includes('Run'))
    .map((node) => content(node))
}

function chip(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'button' && content(node).replace(/\s+/g, ' ').trim() === label)
}

beforeEach(() => {
  desktopMode.value = true
  listTasks.mockReset().mockResolvedValue({ tasks: [localRun, realmRun] })
})

describe('the run list in the desktop', () => {
  it('names where each run runs and counts both places', async () => {
    const mounted = await mountApp(TasksPanel)
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Runs on')
    expect(rows(mounted.root).find((row) => row.includes('qc-sample42'))).toContain('This computer')
    expect(rows(mounted.root).find((row) => row.includes('assemble-run-17'))).toContain('Realm')
    expect(() => chip(mounted.root, 'Everywhere 2')).not.toThrow()
    expect(() => chip(mounted.root, 'This computer 1')).not.toThrow()
    expect(() => chip(mounted.root, 'Realm 1')).not.toThrow()
    mounted.app.unmount()
  })

  it('filters by place and counts the states of that place', async () => {
    const mounted = await mountApp(TasksPanel)
    await flush()

    await click(chip(mounted.root, 'This computer 1'))
    expect(rows(mounted.root).join(' ')).toContain('qc-sample42')
    expect(rows(mounted.root).join(' ')).not.toContain('assemble-run-17')
    expect(() => chip(mounted.root, 'Failed 0')).not.toThrow()
    expect(() => chip(mounted.root, 'Completed 0')).not.toThrow()

    await click(chip(mounted.root, 'Realm 1'))
    expect(rows(mounted.root).join(' ')).toContain('assemble-run-17')
    expect(rows(mounted.root).join(' ')).not.toContain('qc-sample42')
    mounted.app.unmount()
  })
})

describe('the run list on the web', () => {
  it('keeps one place and no place column', async () => {
    desktopMode.value = false
    const mounted = await mountApp(TasksPanel)
    await flush()
    const text = content(mounted.root)

    expect(text).not.toContain('Runs on')
    expect(text).not.toContain('Everywhere')
    expect(text).toContain('qc-sample42')
    expect(text).toContain('assemble-run-17')
    mounted.app.unmount()
  })
})

describe('runs on other nodes', () => {
  it('merges the runs other nodes own and names a node it could not read', async () => {
    desktopMode.value = false
    realmNodes.value = [
      { name: 'node-1', isLocal: true, apiBase: 'https://n1.test/api/v1' },
      { name: 'node-2', isLocal: false, apiBase: 'https://n2.test/api/v1' },
      { name: 'node-3', isLocal: false, apiBase: 'https://n3.test/api/v1' },
    ]
    const farRun = { id: 'J3', name: 'far-run', state: 'COMPLETE', creation_time: created, tags: { [Tes.TES_JOB_ID_TAG]: 'J3' } }
    listTasks.mockReset().mockImplementation(async (_params: unknown, baseUrl?: string) => {
      if (baseUrl === 'https://n3.test/api/v1') throw new Error('down')
      return baseUrl ? { tasks: [farRun, localRun], next_page_token: 'more' } : { tasks: [localRun] }
    })
    const mounted = await mountApp(TasksPanel)
    await flush()
    const text = content(mounted.root)

    expect(listTasks).toHaveBeenCalledWith({ view: 'BASIC', page_size: 50 }, 'https://n2.test/api/v1')
    expect(rows(mounted.root).filter((row) => row.includes('qc-sample42'))).toHaveLength(1)
    expect(rows(mounted.root).join(' ')).toContain('far-run')
    expect(text).toContain('Runs on node-3 could not be read.')
    expect(text).toContain('Only the newest 50 runs of node-2 are shown.')
    realmNodes.value = []
    mounted.app.unmount()
  })
})

describe('the open run of another node', () => {
  it('names the node that owns it to the run details', async () => {
    desktopMode.value = false
    realmNodes.value = [
      { name: 'node-1', nodeId: 'node-1', isLocal: true, apiBase: 'https://n1.test/api/v1' },
      { name: 'node-2', nodeId: 'node-2', isLocal: false, apiBase: 'https://n2.test/api/v1' },
    ]
    const farRun = { id: 'J3', name: 'far-run', state: 'COMPLETE', creation_time: created, tags: { [Tes.TES_JOB_ID_TAG]: 'J3' } }
    listTasks.mockReset().mockImplementation(async (_params: unknown, baseUrl?: string) =>
      ({ tasks: baseUrl ? [farRun] : [localRun] }))
    route.name = 'task'
    route.params = { taskId: 'J3' }
    const far = await mountApp(TasksPanel)
    await flush()
    expect(content(far.root)).toContain('detail J3 at https://n2.test/api/v1')
    far.app.unmount()

    route.params = { taskId: 'J1' }
    const local = await mountApp(TasksPanel)
    await flush()
    expect(content(local.root)).toContain('detail J1 at serving node')
    local.app.unmount()
    route.name = 'compute'
    route.params = {}
    realmNodes.value = []
  })
})

describe('local paging next to other nodes', () => {
  it('keeps Load more for the local continuation when an old remote run sorts last', async () => {
    desktopMode.value = false
    realmNodes.value = [{ name: 'node-2', isLocal: false, apiBase: 'https://n2.test/api/v1' }]
    const oldRun = { id: 'J9', name: 'old-far-run', state: 'COMPLETE', creation_time: new Date(Date.now() - 10 * 86_400_000).toISOString(), tags: { [Tes.TES_JOB_ID_TAG]: 'J9' } }
    listTasks.mockReset().mockImplementation(async (_params: unknown, baseUrl?: string) =>
      baseUrl ? { tasks: [oldRun] } : { tasks: [localRun], next_page_token: 'p2' })
    const mounted = await mountApp(TasksPanel)
    await flush()

    expect(content(mounted.root)).toContain('Load more')
    realmNodes.value = []
    mounted.app.unmount()
  })
})

describe('other nodes that do not answer', () => {
  it('names them with a retry even when no run is listed', async () => {
    desktopMode.value = false
    realmNodes.value = [{ name: 'node-2', isLocal: false, apiBase: 'https://n2.test/api/v1' }]
    listTasks.mockReset().mockImplementation(async (_params: unknown, baseUrl?: string) => {
      if (baseUrl) throw new Error('down')
      return { tasks: [] }
    })
    const mounted = await mountApp(TasksPanel)
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Runs on node-2 could not be read.')
    expect(text).not.toContain('No runs yet')
    listTasks.mockClear()
    await click(element(mounted.root, (node) => content(node) === 'Retry' && typeof node.props.onClick === 'function'))
    expect(listTasks).toHaveBeenCalledWith({ view: 'BASIC', page_size: 50 }, 'https://n2.test/api/v1')
    realmNodes.value = []
    mounted.app.unmount()
  })
})

describe('runs of devices', () => {
  it('asks no device for its runs', async () => {
    desktopMode.value = false
    realmNodes.value = [
      { name: 'node-2', isLocal: false, apiBase: 'https://n2.test/api/v1' },
      { name: 'laptop', isLocal: false, apiBase: 'https://laptop.test/api/v1', kind: 'user' },
    ]
    listTasks.mockReset().mockResolvedValue({ tasks: [] })
    const mounted = await mountApp(TasksPanel)
    await flush()

    expect(listTasks.mock.calls.map(([, baseUrl]) => baseUrl)).toEqual([undefined, 'https://n2.test/api/v1'])
    realmNodes.value = []
    mounted.app.unmount()
  })
})

describe('the run figures', () => {
  it('counts the completed runs and names the nodes they came from', async () => {
    desktopMode.value = false
    realmNodes.value = [{ name: 'node-2', nodeId: 'node-2', isLocal: false, apiBase: 'https://n2.test/api/v1' }]
    const farRun = { id: 'J3', name: 'far-run', state: 'COMPLETE', creation_time: created, tags: {} }
    listTasks.mockReset().mockImplementation(async (_params: unknown, baseUrl?: string) =>
      baseUrl ? { tasks: [farRun] } : { tasks: [localRun, realmRun] })
    const mounted = await mountApp(TasksPanel)
    await flush()
    const cards = nodes(mounted.root).filter((node) => node.tag === 'section').map((node) => content(node).replace(/\s+/g, ' '))

    expect(cards).toContain('Runs 3 2/3 completed')
    expect(cards).toContain('Active 1 0 waiting to start')
    expect(cards).toContain('Compute time Unknown 3 runs started')
    expect(cards.find((card) => card.startsWith('Nodes used'))).toBe('Nodes used 2 name of node-1name of node-2')
    realmNodes.value = []
    mounted.app.unmount()
  })
})

describe('the compute time', () => {
  it('adds up the timed runs as a lower bound while a started run has no timing', async () => {
    const timed = { ...realmRun, logs: [{ start_time: '2026-01-01T00:00:00Z', end_time: '2026-01-01T00:01:00Z' }] }
    listTasks.mockReset().mockResolvedValue({ tasks: [localRun, timed, { ...localRun, id: 'J4', state: 'QUEUED' }] })
    const mounted = await mountApp(TasksPanel)
    await flush()
    const cards = nodes(mounted.root).filter((node) => node.tag === 'section').map((node) => content(node).replace(/\s+/g, ' '))

    expect(cards).toContain('Compute time at least 1m 00s 2 runs started')
    mounted.app.unmount()
  })
})

describe('finding a run', () => {
  it('keeps the runs whose name matches and counts them in the footer', async () => {
    desktopMode.value = false
    const mounted = await mountApp(TasksPanel)
    await flush()
    const input = element(mounted.root, (node) => node.tag === 'input')
    ;(input.props.onInput as (event: { target: { value: string } }) => void)({ target: { value: 'ASSEMBLE' } })
    await flush()

    expect(rows(mounted.root).join(' ')).toContain('assemble-run-17')
    expect(rows(mounted.root).join(' ')).not.toContain('qc-sample42')
    expect(content(mounted.root)).toContain('1 of 2 runs')
    mounted.app.unmount()
  })
})

describe('the run record of a row', () => {
  it('is looked up on click and falls back to the run the node keeps', async () => {
    desktopMode.value = false
    metadataAtPath.mockReset().mockResolvedValue(null)
    getRun.mockReset().mockResolvedValue({ run_id: 'J2', run_crate: 'record-2' })
    const mounted = await mountApp(TasksPanel)
    await flush()
    expect(metadataAtPath).not.toHaveBeenCalled()

    const open = element(mounted.root, (node) => node.tag === 'button' && node.props['aria-label'] === 'Open the run record')
    await (open.props.onClick as (event: { stopPropagation: () => void }) => Promise<void>)({ stopPropagation: () => {} })
    await flush()

    expect(metadataAtPath).toHaveBeenCalledWith('runs/J2')
    expect(push).toHaveBeenLastCalledWith({ name: 'dataset', params: { id: 'record-2' } })
    mounted.app.unmount()
  })
})

describe('the kind and state filters', () => {
  it('tells tool runs from notebook sessions and combines both filters', async () => {
    desktopMode.value = false
    const session = { ...localRun, id: 'J5', name: 'bakta-summary.ipynb', tags: { session: 'python' } }
    listTasks.mockReset().mockResolvedValue({ tasks: [localRun, realmRun, session] })
    const mounted = await mountApp(TasksPanel)
    await flush()

    expect(rows(mounted.root).find((row) => row.includes('bakta-summary'))).toContain('Notebook session, Python')
    await click(chip(mounted.root, 'Tool runs 2'))
    expect(rows(mounted.root).join(' ')).not.toContain('bakta-summary')
    await click(chip(mounted.root, 'Active 2'))
    expect(rows(mounted.root).join(' ')).toContain('qc-sample42')
    expect(rows(mounted.root).join(' ')).not.toContain('assemble-run-17')
    mounted.app.unmount()
  })
})
