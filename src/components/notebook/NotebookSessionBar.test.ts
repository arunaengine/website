import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const jobs = vi.hoisted(() => ({ listJobs: vi.fn() }))
vi.mock('@/lib/jobs', () => jobs)
const sessionApi = vi.hoisted(() => ({ getSessionState: vi.fn() }))
vi.mock('@/lib/notebook/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notebook/session')>()),
  getSessionState: sessionApi.getSessionState,
}))

import * as ComputeAdmin from '@/lib/computeAdmin'
import * as Utils from '@/lib/utils'
import * as NotebookSessions from '@/lib/notebook/sessions'
import * as StateBadge from '@/lib/stateBadge'
import * as NotebookDocument from '@/lib/notebook/document'
import * as NotebookRuntimes from '@/lib/notebook/runtimes'
import * as NotebookSubmit from '@/lib/notebook/submit'
import {
  bubbleClick,
  button,
  flush,
  click,
  compileClientComponent,
  content,
  element,
  mountApp,
  moduleDefault,
  type HostNode,
} from '@/test/clientRender'
import type { NotebookAruna } from '@/lib/notebook/nbformat'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, variant: String, size: String },
  setup: (props, { attrs, slots }) => () =>
    h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})
const SelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String, options: Array, ariaLabel: String, disabled: Boolean },
  setup: (props, { attrs }) => () =>
    h('select', {
      ...attrs,
      disabled: props.disabled,
      'aria-label': props.ariaLabel,
      value: props.modelValue,
      options: props.options,
    }),
})
const DialogStub = defineComponent({
  inheritAttrs: false,
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number], disabled: Boolean },
  setup: (props, { attrs }) => () =>
    h('input', { ...attrs, disabled: props.disabled, value: props.modelValue }),
})

const meta: NotebookAruna = {
  version: 1,
  runtime: 'python-notebook',
  workspace_bucket: 'lab-data',
  group_id: 'group-1',
}

interface Context {
  notebook: Record<string, unknown>
  session: Record<string, unknown>
}

let context: Context

function fakeContext(overrides: { state?: Record<string, unknown> | null; running?: boolean } = {}): Context {
  const state = ref(overrides.state === undefined ? null : overrides.state)
  return {
    notebook: {
      name: computed(() => 'counts'),
      key: ref('notebooks/counts.ipynb'),
      meta: ref<NotebookAruna | null>({ ...meta }),
      patchMeta: vi.fn(),
      loading: ref(false), generation: ref(1),
      cells: ref([{ id: 'code', cell_type: 'code', source: 'print(1)' }, { id: 'text', cell_type: 'markdown', source: '# Title' }]),
      selectCell: vi.fn(),
    },
    session: {
      state,
      kernel: ref('idle'),
      cellStates: ref({}),
      runCells: vi.fn(),
      jobId: ref(overrides.running ? '01JOB' : ''),
      nodeId: ref(overrides.running ? 'node-a' : ''),
      attaching: ref(false),
      attachTo: vi.fn(),
      starting: ref(false),
      ending: ref(false),
      restarting: ref(false),
      error: ref(null),
      notice: ref(null),
      idlePickMs: ref(null),
      live: computed(() => (state.value as { state?: string } | null)?.state === 'ready'),
      ended: computed(() => (state.value as { state?: string } | null)?.state === 'ended'),
      running: computed(() => Boolean(overrides.running)),
      start: vi.fn(),
      end: vi.fn(),
      restart: vi.fn(),
      interrupt: vi.fn(),
    },
  }
}

let realmIdleMs: number | undefined = 1_800_000

let compiled: Component | null = null

function sessionBar(): Component {
  compiled ??= compileClientComponent(new URL('./NotebookSessionBar.vue', import.meta.url), {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => IconStub }),
    '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
    '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
    '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
    '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('div')),
    '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
    '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
    '@/components/ui/Input.vue': moduleDefault(InputStub),
    '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
    '@/components/ui/Select.vue': moduleDefault(SelectStub),
    '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
    '@/components/ui/StatusDot.vue': moduleDefault(Slotted('span')),
    '@/lib/stateBadge': StateBadge,
    '@/components/notebook/NotebookDependencies.vue': moduleDefault(Slotted('div')),
    '@/composables/notebookContext': { injectNotebook: () => context },
    '@/composables/useAruna': { useAruna: () => ({
      myGroups: ref([{ id: 'group-1', name: 'Lab' }]),
      apiBaseUrl: ref('/api/v1'), authToken: ref('bearer-token'),
    }) },
    '@/composables/useNow': { useNow: () => ref(1_000) },
    '@/composables/useComputeAdmin': {
      useComputeAdmin: () => ({
        getComputeConfig: async () => ({ session_idle_after_ms: realmIdleMs }),
      }),
    },
    '@/composables/useRealmNodes': {
      useRealmNodes: () => ({
        nodes: ref([{ nodeId: 'node-a', label: 'Node A', executorKinds: ['docker'] }]),
        displayName: () => 'Node A',
        nodeById: () => ({ apiBase: 'https://node-a.example/api/v1' }),
      }),
    },
    '@/lib/notebook/runtimes': NotebookRuntimes,
    '@/lib/notebook/sessions': NotebookSessions,
    '@/lib/utils': Utils,
    '@/lib/notebook/document': NotebookDocument,
    '@/lib/notebook/submit': NotebookSubmit,
    '@/lib/computeAdmin': ComputeAdmin,
  })
  return compiled
}

async function render(overrides: Parameters<typeof fakeContext>[0] = {}) {
  context = fakeContext(overrides)
  const host = defineComponent({ setup: () => () => h(sessionBar()) })
  const { root } = await mountApp(host)
  return root
}

function select(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'select' && node.props['aria-label'] === label)
}

async function openOptions(root: HostNode) {
  await bubbleClick(element(root, (node) => node.props['aria-label'] === 'Kernel'))
}

beforeEach(() => {
  jobs.listJobs.mockReset().mockResolvedValue({ jobs: [] })
  sessionApi.getSessionState.mockReset()
})

function runningJob(bucket = 'lab-data') {
  return {
    job_id: '01JOB', kind: 'execution', state: 'running', workspace_mode: 'existing',
    workspace_bucket: bucket,
    family: { execution_list: [{ executor_node_id: 'node-a', canonical: true }] },
  }
}

function runningSession(overrides: Record<string, unknown> = {}) {
  return {
    job_id: '01JOB', state: 'ready', runtime: 'python-notebook', workspace_bucket: 'lab-data',
    executor_node_id: 'node-a', started_at_ms: Date.now() - 60_000, cells: [], ...overrides,
  }
}

describe('the session bar', () => {
  it('offers Start while no session runs', async () => {
    const root = await render()
    expect(content(root)).not.toContain('No session')
    expect(() => select(root, 'Runtime')).toThrow()
    expect(button(root, 'Run notebook').props.disabled).toBe(false)
  })

  it('does not show missing-settings warnings while the notebook loads', async () => {
    const root = await render()
    ;(context.notebook.loading as { value: boolean }).value = true
    ;(context.notebook.meta as { value: unknown }).value = null
    await flush()
    expect(content(root)).not.toContain('cannot start yet')
    expect(button(root, 'Run notebook').props.disabled).toBe(true)
  })

  it('shows a genuine missing-runtime warning after loading', async () => {
    const root = await render()
    ;(context.notebook.meta as { value: NotebookAruna }).value.runtime = ''
    await flush()
    await openOptions(root)
    expect(element(root, (node) => node.tag === 'aside').props.lines).toEqual(['Pick a runtime.'])
    expect(button(root, 'Run notebook').props.disabled).toBe(true)
  })

  it('keeps the ended-session notice inside the Kernel menu', async () => {
    const root = await render()
    ;(context.session.notice as { value: string }).value = 'The session ended (idle).'
    await flush()
    expect(content(root)).not.toContain('The session ended (idle).')
    await openOptions(root)
    expect(content(root)).toContain('The session ended (idle).')
  })

  it('calls a live kernel running, not idle', async () => {
    const root = await render({ state: { state: 'ready' }, running: true })
    const kernel = () => content(element(root, (node) => node.props['aria-label'] === 'Kernel'))
    expect(kernel()).toContain('Running')
    expect(kernel()).not.toContain('Idle')
    ;(context.session.kernel as { value: string }).value = 'busy'
    await flush()
    expect(kernel()).toContain('Running a cell')
  })

  it('starts a session with the notebook settings', async () => {
    const root = await render()
    const { start } = context.session as { start: ReturnType<typeof vi.fn> }
    await click(button(root, 'Run notebook'))
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        runtime: 'python-notebook',
        workspaceBucket: 'lab-data',
        name: 'counts',
      }),
    )
  })

  it('runs code cells immediately when the kernel is ready', async () => {
    const root = await render({ state: { state: 'ready' }, running: true })
    await click(button(root, 'Run notebook'))
    expect(context.session.start).not.toHaveBeenCalled()
    expect(context.session.runCells).toHaveBeenCalledWith([{ id: 'code', source: 'print(1)' }])
  })

  it.each([false, true])('runs after startup only for the same notebook: changed=%s', async (changed) => {
    const root = await render({ state: { state: 'starting' }, running: true })
    await click(button(root, 'Run notebook'))
    expect(context.session.runCells).not.toHaveBeenCalled()
    if (changed) (context.notebook.generation as { value: number }).value += 1
    await flush()
    ;(context.session.state as { value: unknown }).value = { state: 'ready' }
    await flush()
    if (changed) expect(context.session.runCells).not.toHaveBeenCalled()
    else expect(context.session.runCells).toHaveBeenCalledTimes(1)
  })

  it('cancels the queued run when startup fails', async () => {
    const root = await render({ state: { state: 'starting' }, running: true })
    await click(button(root, 'Run notebook'))
    ;(context.session.error as { value: unknown }).value = 'Kernel failed'
    await flush()
    ;(context.session.state as { value: unknown }).value = { state: 'ready' }
    await flush()
    expect(context.session.runCells).not.toHaveBeenCalled()
  })

  it('shows the idle countdown from the session state', async () => {
    const root = await render({ state: { state: 'ready', idle_deadline_ms: 301_000, idle_after_ms: 1_800_000 } })
    await openOptions(root)
    expect(content(root)).toContain('Ready')
    expect(content(root)).toContain('5 min left')
  })

  it('offers restart and stop while a session runs', async () => {
    const root = await render({ state: { state: 'ready', idle_deadline_ms: 0 }, running: true })
    await openOptions(root)
    expect(button(root, 'Stop kernel')).toBeTruthy()
    await click(button(root, 'Restart kernel'))
    expect(context.session.restart).toHaveBeenCalledWith(expect.objectContaining({ runtime: 'python-notebook' }))
    expect(button(root, 'Run notebook')).toBeTruthy()
  })

  it('locks the idle pick while a session runs and hides the realm default', async () => {
    realmIdleMs = 1_800_000
    // The session picked a shorter timeout; the realm value is what counts.
    const root = await render({ state: { state: 'ready', idle_after_ms: 300_000 }, running: true })
    await openOptions(root)
    const idle = select(root, 'Idle timeout')
    expect(idle.props.disabled).toBe(true)
    const labels = (idle.props.options as { label: string }[]).map((option) => option.label)
    expect(labels).toEqual(['Realm default', '5 minutes', '15 minutes'])
  })

  it('offers the running sessions the kernel dialog found', async () => {
    jobs.listJobs.mockResolvedValue({ jobs: [runningJob()] })
    sessionApi.getSessionState.mockResolvedValue(runningSession())
    const root = await render()
    await openOptions(root)
    await flush()
    expect(jobs.listJobs).toHaveBeenCalledWith({ state: 'running', limit: 50 }, { baseUrl: '/api/v1', token: 'bearer-token' })
    expect(content(root)).toContain('Python')
    expect(content(root)).toContain('Node A')
    await click(button(root, 'Attach'))
    expect(context.session.attachTo).toHaveBeenCalledWith('01JOB', 'node-a')
  })

  it('marks a session that works in another bucket and refuses it', async () => {
    jobs.listJobs.mockResolvedValue({ jobs: [runningJob('other-bucket')] })
    sessionApi.getSessionState.mockResolvedValue(runningSession({ workspace_bucket: 'other-bucket' }))
    const root = await render()
    await openOptions(root)
    await flush()
    expect(content(root)).toContain('other bucket or runtime')
    const attach = button(root, 'Attach')
    expect(attach.props.disabled).toBe(true)
    expect(String(attach.props.title)).toContain('another bucket or runtime')
  })

  it('says that running jobs were left unread', async () => {
    const page = Array.from({ length: 12 }, (_, index) => ({ ...runningJob(), job_id: `01JOB${index}` }))
    jobs.listJobs.mockResolvedValue({ jobs: page, next_cursor: 'page-2' })
    sessionApi.getSessionState.mockResolvedValue(runningSession())
    const root = await render()
    await openOptions(root)
    await flush()
    expect(content(root)).toContain('this list may be incomplete')
  })

  it('says the running sessions could not be listed', async () => {
    jobs.listJobs.mockRejectedValue(new Error('jobs unavailable'))
    const root = await render()
    await openOptions(root)
    await flush()
    expect(content(root)).toContain('could not be listed')
    expect(content(root)).not.toContain('No running session was found')
  })

  it('hides the value the compute config reports', async () => {
    realmIdleMs = 300_000
    const root = await render()
    await openOptions(root)
    const labels = (select(root, 'Idle timeout').props.options as { label: string }[]).map(
      (option) => option.label,
    )
    expect(labels).toEqual(['Realm default', '15 minutes', '30 minutes'])
    realmIdleMs = 1_800_000
  })
})
