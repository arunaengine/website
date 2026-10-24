import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, type HostNode } from '@/test/clientRender'

const desktopMode = ref(true)
const listTasks = vi.fn()

const Plain = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const Empty = defineComponent(() => () => null)
const ShellStub = defineComponent((_, { slots }) => () => h('div', [slots.filters?.(), slots.tools?.(), slots.default?.()]))
const FilterChips = compileClientComponent(new URL('../ui/FilterChips.vue', import.meta.url), { vue: VueRuntime })

const TasksPanel = compileClientComponent(new URL('./TasksPanel.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': {
    RouterLink: Plain,
    useRoute: () => ({ name: 'compute', params: {} }),
    useRouter: () => ({ push: vi.fn() }),
  },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Plain),
  '@/components/ui/EmptyState.vue': moduleDefault(Plain),
  '@/components/ui/Notice.vue': moduleDefault(Plain),
  '@/components/ui/RefreshButton.vue': moduleDefault(Empty),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/FilterChips.vue': moduleDefault(FilterChips),
  '@/components/ui/ListShell.vue': moduleDefault(ShellStub),
  '@/components/ui/ListSkeleton.vue': moduleDefault(Empty),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/compute/TaskStateBadge.vue': moduleDefault(Empty),
  '@/components/compute/TesPlacementTags.vue': moduleDefault(Empty),
  '@/components/compute/TaskDetailPanel.vue': moduleDefault(Empty),
  '@/components/compute/NewRunMenu.vue': moduleDefault(Empty),
  '@/composables/useTes': {
    useTes: () => ({ getTesServiceInfo: async () => ({ type: { version: '1.1' } }), listTasks }),
    isTesUnsupported: () => false,
  },
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref({ id: 'u1' }), myGroups: ref([]) }) },
  '@/composables/useAuth': { useAuth: () => ({ authPending: ref(false) }) },
  '@/composables/useJobs': { useJobs: () => ({ deleteJob: vi.fn() }) },
  '@/composables/useNow': { useNow: () => ref(Date.now()) },
  '@/composables/useRefresh': { useRefresh: (run: () => unknown) => ({ busy: ref(false), refresh: run }) },
  '@/composables/useFirstPaint': { useFirstPaint: (ready: () => boolean) => computed(ready) },
  '@/lib/utils': Utils,
  '@/lib/poll': { follow: () => () => {}, onWake: () => () => {} },
  '@/lib/jobs': { deleteErrorMessage: () => null },
  '@/lib/notebook/submit': { sessionRuntime: () => null },
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
