import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useRefresh } from '@/composables/useRefresh'
import { refreshButton } from '@/test/clientRender'
import { ApiError } from '@/lib/api'
import * as Jobs from '@/lib/jobs'
import * as Poll from '@/lib/poll'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import type { JobAuditResponse, JobFamilyResponse, JobStatusResponse } from '@/lib/jobs'

const PassThroughStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const OpenPassThroughStub = defineComponent({
  props: { open: Boolean },
  setup(props, { slots }) {
    return () =>
      props.open ? h('div', [slots.header?.(), slots.default?.(), slots.footer?.()]) : null
  },
})
const StagesStub = defineComponent({
  props: { stages: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h(
      'ul',
      (props.stages as Array<{ label: string; detail?: string }>).map((stage) =>
        h('li', `${stage.label} ${stage.detail ?? ''}`),
      ),
    ),
})
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const ErrorPanelStub = defineComponent({
  props: { message: String },
  setup: (props) => () => h('div', `ERROR: ${props.message}`),
})
const JobStateBadgeStub = defineComponent({
  props: { state: String },
  setup: (props) => () => h('span', props.state),
})
const PlacementFigureStub = defineComponent(() => () => h('div', 'placement figure'))
const ExecutionsTableStub = defineComponent(() => () => h('div', 'executions table'))
const NodeLabelStub = defineComponent({
  props: { nodeId: String },
  setup: (props) => () => h('span', props.nodeId),
})
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const CountedListStub = defineComponent({
  props: { items: { type: Array, default: () => [] }, noun: String },
  setup: (props) => () => h('span', `${(props.items as string[]).length} ${props.noun}`),
})
const PaginationStub = defineComponent({
  props: { page: Number, pageCount: Number, hasNext: Boolean },
  emits: ['update:page'],
  setup: (props, { emit }) => () =>
    h('button', { onClick: () => emit('update:page', (props.page ?? 1) + 1) }, 'Next page'),
})
const icons = new Proxy({}, { get: () => PassThroughStub })
const moduleDefault = (component: Component) => ({ __esModule: true, default: component })

function compileClientComponent(url: URL, modules: Record<string, unknown>): Component {
  const source = readFileSync(url, 'utf8')
  const { descriptor } = parse(source, { filename: url.pathname })
  if (!descriptor.template) throw new Error(`Missing template in ${url.pathname}`)
  const script = compileScript(descriptor, { id: url.pathname, inlineTemplate: false })
  const scriptJavascript = transpileModule(script.content, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  const cjs = { exports: {} as Record<string, unknown> }
  const localRequire = (id: string) => {
    if (!(id in modules)) throw new Error(`Missing test module ${id} for ${url.pathname}`)
    return modules[id]
  }
  new Function('require', 'exports', 'module', scriptJavascript)(localRequire, cjs.exports, cjs)
  const component = cjs.exports.default as Component
  const { code } = compile(descriptor.template.content, {
    mode: 'function',
    prefixIdentifiers: true,
    bindingMetadata: script.bindings,
  })
  const renderJavascript = transpileModule(code, {
    compilerOptions: { module: ModuleKind.None, target: ScriptTarget.ES2022 },
  }).outputText
  Object.assign(component, { render: new Function('Vue', renderJavascript)(VueRuntime) })
  return component
}

type HostKind = 'root' | 'element' | 'text' | 'comment'
interface HostNode {
  kind: HostKind
  tag: string
  text: string
  props: Record<string, unknown>
  children: HostNode[]
  parent: HostNode | null
}

function hostNode(kind: HostKind, tag = '', text = ''): HostNode {
  return { kind, tag, text, props: {}, children: [], parent: null }
}

function insert(child: HostNode, parent: HostNode, anchor: HostNode | null = null) {
  child.parent = parent
  const index = anchor ? parent.children.indexOf(anchor) : -1
  if (index >= 0) parent.children.splice(index, 0, child)
  else parent.children.push(child)
}

const renderer = createRenderer<HostNode, HostNode>({
  patchProp(node, key, _previous, value) {
    node.props[key] = value
  },
  insert,
  remove(node) {
    if (!node.parent) return
    const index = node.parent.children.indexOf(node)
    if (index >= 0) node.parent.children.splice(index, 1)
    node.parent = null
  },
  createElement(tag) {
    return hostNode('element', tag)
  },
  createText(text) {
    return hostNode('text', '', text)
  },
  createComment(text) {
    return hostNode('comment', '', text)
  },
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
    node.children = []
  },
  parentNode: (node) => node.parent,
  nextSibling(node) {
    if (!node.parent) return null
    const index = node.parent.children.indexOf(node)
    return node.parent.children[index + 1] ?? null
  },
  insertStaticContent(content, parent, anchor) {
    const node = hostNode('text', '', content)
    insert(node, parent, anchor)
    return [node, node]
  },
})

function content(node: HostNode): string {
  return `${node.text}${node.children.map(content).join('')}`
}

function findAll(node: HostNode, match: (node: HostNode) => boolean): HostNode[] {
  const hits = node.children.flatMap((child) => findAll(child, match))
  return match(node) ? [node, ...hits] : hits
}

async function press(root: HostNode, text: string) {
  const target = findAll(root, (node) => node.tag === 'button' && content(node).includes(text))[0]
  if (!target) throw new Error(`No button named ${text}`)
  await (target.props.onClick as ((event?: unknown) => unknown) | undefined)?.()
  await nextTick()
}

async function mount(component: Component, props: Record<string, unknown>) {
  const root = hostNode('root')
  const app: App<HostNode> = renderer.createApp(component, props)
  const errors: unknown[] = []
  app.config.errorHandler = (error) => errors.push(error)
  app.mount(root)
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
  return { app, root, errors }
}

const family: JobFamilyResponse = {
  submission_id: 'submission',
  request_digest: 'request',
  canonical_job_id: 'canonical-job',
  aliases: ['canonical-job'],
  alias_count: 1,
  conflict_count: 0,
  logical_state: 'running',
  canonical_execution_id: 'canonical-execution',
  executions: 1,
  duplicate_successes: 0,
  outputs: [
    {
      bucket: 'results',
      key: 'reports/known.html',
      version_id: 'version-known',
      execution_id: 'canonical-execution',
      container_path: '/outputs/known.html',
      size: 2048,
      digest: 'digest-known',
      endpoint_url: 'https://owner.node.test',
    },
    {
      bucket: 'results',
      key: 'reports/orphan.html',
      version_id: 'version-orphan',
      execution_id: 'canonical-execution',
      size: 1024,
      endpoint_url: null,
    },
  ],
  revision: 3,
  projection_digest: 'projection-digest',
  partial: false,
  locally_exhausted: false,
  cancel_requested: false,
  placement: {
    executor_kind: 'docker',
    estimated_transfer_bytes: 4194304,
    estimated_transfer_ms: 340,
    alternatives: 2,
    rejected: 1,
    omitted: 0,
    stored_at_ms: 1755500000000,
  },
}

function taskPanel(getTask: unknown, getJob: unknown): Component {
  return compileClientComponent(new URL('../compute/TaskDetailPanel.vue', import.meta.url), {
    vue: VueRuntime,
    'vue-router': { RouterLink: RouterLinkStub, useRouter: () => ({ push: vi.fn() }) },
    '@lucide/vue': icons,
    '@/components/ui/DetailDialog.vue': moduleDefault(OpenPassThroughStub),
    '@/components/ui/DialogTitle.vue': moduleDefault(PassThroughStub),
    '@/components/ui/Notice.vue': moduleDefault(PassThroughStub),
    '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
    '@/components/ui/Skeleton.vue': moduleDefault(PassThroughStub),
    '@/components/ui/ErrorPanel.vue': moduleDefault(ErrorPanelStub),
    '@/components/ui/CopyButton.vue': moduleDefault(PassThroughStub),
    '@/components/ui/ExternalLink.vue': moduleDefault(PassThroughStub),
    '@/components/ui/Tooltip.vue': moduleDefault(PassThroughStub),
    '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
    '@/components/ui/DetailList.vue': moduleDefault(
      compileClientComponent(new URL('../ui/DetailList.vue', import.meta.url), { vue: VueRuntime }),
    ),
    '@/components/ui/CountedList.vue': moduleDefault(CountedListStub),
    '@/components/ui/DocsLink.vue': moduleDefault(PassThroughStub),
    '@/components/ui/Pagination.vue': moduleDefault(PaginationStub),
    '@/components/jobs/JobPlacementFigure.vue': moduleDefault(PlacementFigureStub),
    '@/components/jobs/JobExecutionsTable.vue': moduleDefault(ExecutionsTableStub),
    '@/components/compute/RunLogDialog.vue': moduleDefault(PassThroughStub),
    '@/components/compute/TaskHeader.vue': moduleDefault(PassThroughStub),
    '@/components/assistant/AskAiButton.vue': moduleDefault(PassThroughStub),
    '@/components/compute/TaskStateBadge.vue': moduleDefault(JobStateBadgeStub),
    '@/components/compute/TesPlacementTags.vue': moduleDefault(PassThroughStub),
    '@/components/onboarding/ClaimWatchStep.vue': moduleDefault(StagesStub),
    '@/composables/useTes': {
      isTesUnsupported: () => false,
      useTes: () => ({ getTask, cancelTask: vi.fn(), busy: ref(false) }),
    },
    '@/composables/useJobs': { useJobs: () => ({ getJob }) },
    '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
    '@/composables/useRefresh': { useRefresh },
    '@/composables/useAruna': {
      useAruna: () => ({
        myGroups: ref([]),
        apiBaseUrl: ref('https://node.test/api/v1'),
        metadataAtPath: vi.fn(async () => null),
      }),
    },
    '@/composables/useHiddenTasks': { useHiddenTasks: () => ({ hide: vi.fn() }) },
    '@/composables/useS3': { useS3: () => ({ endpoint: ref(null) }) },
    '@/components/preview/PreviewBody.vue': moduleDefault(PassThroughStub),
    '@/lib/chunk-recovery': { asyncChunkError: () => undefined },
    '@/lib/quickRuntimes': { detectQuickRun: () => false },
    '@/lib/jobs': Jobs,
    '@/lib/poll': Poll,
    '@/lib/tes': Tes,
    '@/lib/utils': Utils,
  })
}

function jobPanel(job: JobStatusResponse): Component {
  return compileClientComponent(new URL('./JobDetailPanel.vue', import.meta.url), {
    vue: VueRuntime,
    '@lucide/vue': icons,
    '@/components/ui/DetailDialog.vue': moduleDefault(OpenPassThroughStub),
    '@/components/ui/DialogTitle.vue': moduleDefault(PassThroughStub),
    '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
    '@/components/ui/Notice.vue': moduleDefault(PassThroughStub),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Progress.vue': moduleDefault(PassThroughStub),
    '@/components/ui/Skeleton.vue': moduleDefault(PassThroughStub),
    '@/components/ui/ErrorPanel.vue': moduleDefault(ErrorPanelStub),
    '@/components/ui/CopyButton.vue': moduleDefault(PassThroughStub),
    '@/components/jobs/JobArtifactButton.vue': moduleDefault(PassThroughStub),
    '@/components/jobs/JobAuditTrail.vue': moduleDefault(PassThroughStub),
    '@/components/jobs/JobFamilySection.vue': moduleDefault(
      defineComponent(() => () => h('section', 'native family detail')),
    ),
    '@/components/jobs/JobReportPanel.vue': moduleDefault(PassThroughStub),
    '@/components/jobs/JobStateBadge.vue': moduleDefault(JobStateBadgeStub),
    '@/composables/useJobs': {
      useJobDetail: () => ({
        job: ref(job),
        loadState: ref('ready'),
        loadError: ref(null),
        lastPollError: ref(null),
        cancelling: ref(false),
        cancelError: ref(null),
        load: vi.fn(),
        cancel: vi.fn(),
      }),
    },
    '@/lib/jobs': Jobs,
    '@/lib/utils': Utils,
  })
}

describe('distributed job detail components', () => {
  const familyModules = {
    vue: VueRuntime,
    'vue-router': { RouterLink: RouterLinkStub },
    '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
    '@/components/ui/CopyButton.vue': moduleDefault(PassThroughStub),
    '@/components/jobs/JobStateBadge.vue': moduleDefault(JobStateBadgeStub),
    '@/components/jobs/JobPlacementFigure.vue': moduleDefault(PlacementFigureStub),
    '@/components/jobs/JobExecutionsTable.vue': moduleDefault(ExecutionsTableStub),
    '@/lib/jobs': Jobs,
    '@/lib/utils': Utils,
  }
  const figureModules = {
    vue: VueRuntime,
    '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/DocsLink.vue': moduleDefault(PassThroughStub),
    '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
    '@/components/ui/Pagination.vue': moduleDefault(PaginationStub),
    '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
    '@/lib/jobs': Jobs,
    '@/lib/utils': Utils,
  }
  const figure = () =>
    compileClientComponent(new URL('./JobPlacementFigure.vue', import.meta.url), figureModules)
  const executionsTable = () =>
    compileClientComponent(new URL('./JobExecutionsTable.vue', import.meta.url), {
      vue: VueRuntime,
      '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
      '@/components/ui/CopyButton.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DocsLink.vue': moduleDefault(PassThroughStub),
      '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
      '@/components/ui/Notice.vue': moduleDefault(PassThroughStub),
      '@/components/jobs/JobStateBadge.vue': moduleDefault(JobStateBadgeStub),
      '@/lib/jobs': Jobs,
      '@/lib/utils': Utils,
    })
  const placementInputs = [
    { destination_key: 'in/reads.fq.gz', bytes: 1288490188, source_node_id: null, transfer_ms: 0 },
    { destination_key: 'in/reference.fa', bytes: 314572800, source_node_id: 'node-bielefeld', transfer_ms: 4000 },
    { destination_key: 'in/config.yaml', bytes: 2048, source_node_id: null, transfer_ms: 0 },
  ]

  it('states no workspace detail, whatever the node reports', async () => {
    // A node may still serve a mode and a bucket; a run owns neither any more.
    const JobDetailPanel = jobPanel({
      job_id: '01JJRSTVWXYZ0123456789ABCD',
      kind: 'execution',
      state: 'succeeded',
      attempts: 1,
      cancel_requested: false,
      created_at: '2026-04-09T14:23:11.123+00:00',
      updated_at: '2026-04-09T14:31:47.902+00:00',
      progress: { current: 2, total: 2, unit: 'inputs' },
      workspace_bucket: 'ws-01jjrstvwxyz0123456789abcd',
      workspace_mode: 'kept',
      run_crate: { '@id': 'runs/01JJRSTVWXYZ0123456789ABCD' },
    })

    const mounted = await mount(JobDetailPanel, { jobId: '01JJRSTVWXYZ0123456789ABCD', open: true })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).not.toContain('Workspace')
    expect(text).not.toContain('ws-01jjrstvwxyz0123456789abcd')
    expect(text).not.toContain('kept')
    expect(text).toContain('Run dataset')
    mounted.app.unmount()
  })

  it('labels planner transfer values as plan-time estimates', async () => {
    // Without the per-input record the plan totals are all the figure has.
    const mounted = await mount(figure(), { placement: family.placement })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Estimated at planning time')
    expect(text).toContain('Data moved to the compute')
    expect(text).toContain('4 MB')
    expect(text).toContain('340 ms')
    expect(text).not.toContain('stays')
    mounted.app.unmount()
  })

  it('says nothing moved when every input was there', async () => {
    const local = placementInputs.map((input) => ({ ...input, source_node_id: null, transfer_ms: 0 }))
    const mounted = await mount(figure(), {
      placement: { ...family.placement!, target_node_id: 'node-giessen', inputs: local },
    })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Compute went to the data')
    expect(text).toContain('All 3 inputs were already on node-giessen. Nothing moved.')
    expect(text).toContain('1.5 GB stayed')
    // Hundreds of inputs must not land on the page unasked.
    expect(text).not.toContain('in/reads.fq.gz')
    expect(text).toContain('Show movements (3)')
    mounted.app.unmount()
  })

  it('counts the moved inputs of a mixed plan', async () => {
    const mounted = await mount(figure(), {
      placement: { ...family.placement!, target_node_id: 'node-giessen', inputs: placementInputs },
    })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Mixed: 1 of 3 moved')
    expect(text).toContain('1 of 3 inputs (300 MB, about 4s) was copied to node-giessen; 1.2 GB stayed.')
    expect(text).toContain('300 MB moved · ~4s')
    mounted.app.unmount()
  })

  it('sums the transfer when every input moved', async () => {
    const moved = placementInputs.map((input) => ({
      ...input,
      source_node_id: 'node-giessen',
      transfer_ms: 4000,
    }))
    const mounted = await mount(figure(), {
      placement: { ...family.placement!, target_node_id: 'node-bielefeld', inputs: moved },
    })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Data moved to the compute')
    expect(text).toContain('All 3 inputs (1.5 GB, about 12s) were copied to node-bielefeld.')
    expect(text).toContain('0 B stayed')
    mounted.app.unmount()
  })

  it('pages the movements a reader asks for', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      destination_key: `in/file-${i}.txt`,
      bytes: 1024,
      source_node_id: i === 0 ? 'node-bielefeld' : null,
      transfer_ms: i === 0 ? 2000 : 0,
    }))
    const mounted = await mount(figure(), {
      placement: { ...family.placement!, target_node_id: 'node-giessen', inputs: many },
    })

    await press(mounted.root, 'Show movements (12)')
    let text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('in/file-0.txt')
    expect(text).toContain('in/file-7.txt')
    expect(text).not.toContain('in/file-8.txt')
    expect(text).toContain('1–8 of 12')

    await press(mounted.root, 'Next page')
    text = content(mounted.root)

    expect(text).toContain('in/file-8.txt')
    expect(text).not.toContain('in/file-0.txt')
    expect(text).toContain('9–12 of 12')
    mounted.app.unmount()
  })

  it('shows the candidates only when asked', async () => {
    const candidates = [
      { node_id: 'node-giessen', executor_kind: 'docker', verdict: 'selected' as const },
      { node_id: 'node-bielefeld', executor_kind: 'docker', verdict: 'ranked' as const, rank: 1 },
      { node_id: 'node-edge', verdict: 'rejected' as const, reason: 'no executor' },
    ]
    const mounted = await mount(figure(), {
      placement: { ...family.placement!, target_node_id: 'node-giessen', candidates },
    })

    expect(content(mounted.root)).not.toContain('no executor')
    await press(mounted.root, 'Show candidates (3)')
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('selected')
    expect(text).toContain('ranked 1')
    expect(text).toContain('no executor')
    expect(text).toContain('1–3 of 3')
    mounted.app.unmount()
  })

  it('names an unknown output endpoint instead of hiding the output', async () => {
    const JobFamilySection = compileClientComponent(
      new URL('./JobFamilySection.vue', import.meta.url),
      familyModules,
    )

    const mounted = await mount(JobFamilySection, { family })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('https://owner.node.test')
    expect(text).toContain('reports/orphan.html')
    expect(text).toContain('Owner endpoint unknown')
    expect(text).toContain('version-orphan')
    mounted.app.unmount()
  })

  it('reports compute-to-data when the plan moved no bytes', async () => {
    const mounted = await mount(figure(), {
      placement: { ...family.placement!, estimated_transfer_bytes: 0, estimated_transfer_ms: 0 },
    })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Compute went to the data')
    expect(text).toContain('the plan moved no bytes')
    mounted.app.unmount()
  })

  it('says no local plan exists rather than claiming none was made', async () => {
    const mounted = await mount(figure(), { placement: undefined })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Not placed')
    expect(text).toContain('No local placement record for this family')
    expect(text).toContain('No executor was selected in a plan this node stored')
    mounted.app.unmount()
  })

  it('lists every execution with its result', async () => {
    const listed: JobFamilyResponse = {
      ...family,
      execution_list: [
        {
          execution_id: '01EXECUTIONCANONICAL',
          executor_node_id: 'node-giessen',
          state: 'succeeded',
          started_at_ms: 1755500000000,
          observed_at_ms: 1755500100000,
          canonical: true,
        },
        {
          execution_id: '01EXECUTIONDUPLICATE',
          executor_node_id: 'node-bielefeld',
          state: 'running',
          started_at_ms: 1755500010000,
          observed_at_ms: null,
          canonical: false,
        },
      ],
      executions: 2,
      duplicate_successes: 1,
      responder_node_id: 'node-giessen',
    }

    const mounted = await mount(executionsTable(), { family: listed })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('node-giessen')
    expect(text).toContain('node-bielefeld')
    expect(text).toContain('the result')
    expect(text).toContain('replaced, still in progress')
    expect(text).toContain('not recorded')
    expect(text).toContain('1 duplicate success')
    expect(text).toContain(Utils.truncateMiddle('01EXECUTIONCANONICAL'))
    // The word never reaches the reader, only the role does.
    expect(text).not.toContain('canonical')
    mounted.app.unmount()
  })

  it('names a catch-up instead of hiding the quiet execution', async () => {
    const listed: JobFamilyResponse = {
      ...family,
      execution_list: [
        {
          execution_id: '01EXECUTIONQUIET',
          executor_node_id: 'node-bielefeld',
          state: 'indeterminate',
          started_at_ms: 1755500000000,
          observed_at_ms: 1755500060000,
          canonical: false,
        },
        {
          execution_id: '01EXECUTIONLATER',
          executor_node_id: 'node-giessen',
          state: 'succeeded',
          started_at_ms: 1755500100000,
          observed_at_ms: 1755500200000,
          canonical: true,
        },
      ],
    }

    const mounted = await mount(executionsTable(), { family: listed })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('An earlier execution went quiet and a later one supplied the result')
    expect(text).toContain('replaced, silent for')
    expect(text).toContain('the result')
    mounted.app.unmount()
  })

  it('keeps the count line when a node serves no list', async () => {
    const mounted = await mount(executionsTable(), { family })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('1 execution recorded')
    expect(text).toContain('Result execution')
    expect(text).toContain('canonical-execution')
    mounted.app.unmount()
  })

  it('offers a download only once the archive is there', async () => {
    const headJobArtifact = vi.fn(async () => ({
      state: 'available' as const,
      etag: 'abc123',
      size: 2048,
      filename: 'run.zip',
    }))
    const JobArtifactButton = compileClientComponent(
      new URL('./JobArtifactButton.vue', import.meta.url),
      {
        vue: VueRuntime,
        '@lucide/vue': icons,
        '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
        '@/components/ui/Button.vue': moduleDefault(ButtonStub),
        '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
        '@/composables/useJobs': {
          useJobs: () => ({ headJobArtifact, downloadJobArtifact: vi.fn() }),
        },
        '@/composables/useRefresh': { useRefresh },
        '@/lib/utils': Utils,
      },
    )

    const mounted = await mount(JobArtifactButton, { jobId: '01JOB' })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(headJobArtifact).toHaveBeenCalledWith('01JOB')
    expect(text).toContain('Download run dataset')
    expect(text).toContain('2 KB')
    expect(text).toContain('abc123')
    mounted.app.unmount()
  })

  it('names each unavailable archive state instead of failing', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ state: 'pending', jobState: 'running' }, 'and it\n      is running'],
      [{ state: 'expired' }, 'retention window has passed'],
      [{ state: 'unauthorized' }, 'may not read this run dataset'],
      [{ state: 'absent' }, 'No run dataset archive is kept'],
    ]
    for (const [status, expected] of cases) {
      const JobArtifactButton = compileClientComponent(
        new URL('./JobArtifactButton.vue', import.meta.url),
        {
          vue: VueRuntime,
          '@lucide/vue': icons,
          '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
          '@/components/ui/Button.vue': moduleDefault(ButtonStub),
          '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
          '@/composables/useJobs': {
            useJobs: () => ({
              headJobArtifact: vi.fn(async () => status),
              downloadJobArtifact: vi.fn(),
            }),
          },
          '@/composables/useRefresh': { useRefresh },
          '@/lib/utils': Utils,
        },
      )

      const mounted = await mount(JobArtifactButton, { jobId: '01JOB' })
      const text = content(mounted.root).replace(/\s+/g, ' ')

      expect(mounted.errors).toEqual([])
      expect(text).toContain(expected.replace(/\s+/g, ' '))
      expect(text).not.toContain('Download run dataset')
      mounted.app.unmount()
    }
  })

  it('renders the placement tags and hides the block without them', async () => {
    const modules = {
      vue: VueRuntime,
      'vue-router': { RouterLink: RouterLinkStub },
      '@lucide/vue': icons,
      '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
      '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
      '@/lib/jobs': Jobs,
      '@/lib/tes': Tes,
      '@/lib/utils': Utils,
    }
    const TesPlacementTags = compileClientComponent(
      new URL('../compute/TesPlacementTags.vue', import.meta.url),
      modules,
    )

    const tagged = await mount(TesPlacementTags, {
      tags: {
        'aruna-engine.org/job-id': '01JOBIDENTIFIER',
        'aruna-engine.org/logical-state': 'succeeded',
        'aruna-engine.org/executor-kind': 'docker',
        'aruna-engine.org/estimated-transfer-bytes': '0',
        'aruna-engine.org/label/region': 'eu-central',
        'aruna-engine.org/label/aruna-engine.org/node': '01NODEALPHA',
      },
    })
    const taggedText = content(tagged.root)

    expect(tagged.errors).toEqual([])
    expect(taggedText).toContain('Compute-to-data')
    // The logical state is worded by the shared job state map, never raw.
    expect(taggedText).toContain('Succeeded')
    expect(taggedText).not.toContain('succeeded')
    expect(taggedText).toContain('docker')
    expect(taggedText).toContain('region=eu-central')
    // The node constraint is named, never printed as a raw key=value pair.
    expect(taggedText.replace(/\s+/g, ' ')).toContain('node: 01NODEALPHA')
    expect(taggedText).not.toContain('aruna-engine.org/node=')
    tagged.app.unmount()

    const untagged = await mount(TesPlacementTags, {
      tags: { 'aruna-engine.org/group': 'group' },
    })

    expect(untagged.errors).toEqual([])
    // Nothing visible renders: no element (no badges, no job link); only
    // comment placeholders and whitespace remain.
    expect(untagged.root.children.every((node) => node.kind !== 'element')).toBe(true)
    untagged.app.unmount()
  })

  it('renders audit records by at_ms instead of API page order', async () => {
    const page: JobAuditResponse = {
      submission_id: 'submission',
      request_digest: 'request',
      scope: 'family',
      records: [
        {
          kind: 'spec',
          digest: 'late-record-digest',
          request_digest: 'request',
          conflicting_family: false,
          job_id: 'late-job',
          spec_digest: 'late-spec',
          at_ms: 300,
        },
        {
          kind: 'claim',
          digest: 'early-record-digest',
          request_digest: 'request',
          conflicting_family: false,
          job_id: 'early-job',
          canonical_alias: true,
          spec_digest: 'early-spec',
          at_ms: 100,
        },
        {
          kind: 'update',
          digest: 'middle-record-digest',
          request_digest: 'request',
          conflicting_family: false,
          execution_id: 'mid-exec',
          sequence: 2,
          state: 'running',
          at_ms: 200,
        },
      ],
      conflicts: [{ kind: 'claim', digest: 'refused', retained: 'retained', observed_at_ms: 400 }],
      projection_digest: 'projection',
      partial: true,
    }
    const getJobAudit = vi.fn(async () => page)
    const JobAuditTrail = compileClientComponent(new URL('./JobAuditTrail.vue', import.meta.url), {
      vue: VueRuntime,
      '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
      '@/components/ui/DetailDialog.vue': moduleDefault(OpenPassThroughStub),
      '@/components/ui/DialogClose.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogDescription.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogFooter.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogHeader.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogTitle.vue': moduleDefault(PassThroughStub),
      '@/components/ui/ErrorPanel.vue': moduleDefault(ErrorPanelStub),
      '@/components/ui/Skeleton.vue': moduleDefault(PassThroughStub),
      '@/components/ui/Spinner.vue': moduleDefault(PassThroughStub),
      '@/composables/useJobs': { useJobs: () => ({ getJobAudit }) },
      '@/lib/utils': Utils,
    })

    const mounted = await mount(JobAuditTrail, { jobId: 'job-id', open: true })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text.indexOf('early-job')).toBeLessThan(text.indexOf('mid-exec'))
    expect(text.indexOf('mid-exec')).toBeLessThan(text.indexOf('late-job'))
    expect(text).toContain('Record-key conflicts')
    expect(text).toContain('Partial responder view')
    expect(getJobAudit).toHaveBeenCalledWith('job-id', {
      scope: 'family',
      cursor: undefined,
      limit: 64,
    })
    mounted.app.unmount()
  })

  it('keeps a native 404 as a muted TES detail fallback', async () => {
    const getJob = vi.fn(async () => {
      throw new ApiError(404, 'not found')
    })
    const getTask = vi.fn(async () => ({
      id: 'native-job-id',
      name: 'TES task',
      state: 'COMPLETE',
      executors: [],
      inputs: [],
      outputs: [],
      logs: [],
      tags: {},
    }))
    const mounted = await mount(taskPanel(getTask, getJob), { taskId: 'native-job-id', open: true })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(getJob).toHaveBeenCalledWith('native-job-id')
    expect(text).toContain('Distributed execution detail could not be loaded.')
    expect(text).not.toContain('native family detail')
    expect(text).not.toContain('ERROR:')
    mounted.app.unmount()
  })

  it('tells a failure once, with its cause', async () => {
    // The badge says Failed; only the stage and the cause line say what failed.
    const getTask = vi.fn(async () => ({
      id: 'failed-run',
      state: 'EXECUTOR_ERROR',
      executors: [{ image: 'alpine', command: ['sh'] }],
      inputs: [],
      outputs: [],
      logs: [{ logs: [{ exit_code: 2 }], outputs: [] }],
      tags: {},
    }))
    const getJob = vi.fn(async () => ({ family: null }))

    const mounted = await mount(taskPanel(getTask, getJob), { taskId: 'failed-run', open: true })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Finished the script failed')
    expect(text).toContain('The script exited with code 2')
    expect(text).not.toContain('executor error')
    mounted.app.unmount()
  })

  it('puts the failure evidence first', async () => {
    // The native error and the bounded output tail carry the cause; a merged
    // stream is labelled output, not an empty stderr.
    const getTask = vi.fn(async () => ({
      id: 'failed-run',
      state: 'EXECUTOR_ERROR',
      executors: [{ image: 'ghcr.io/astral-sh/uv:python3.13-bookworm-slim', command: ['uv', 'run'] }],
      inputs: [],
      outputs: [],
      logs: [
        {
          logs: [{ exit_code: 2, stdout: 'error: Failed to initialize cache' }],
          outputs: [],
          system_logs: ['container exited with code 2: Error: Failed to initialize cache'],
        },
      ],
      tags: { 'aruna-engine.org/label/aruna-engine.org/node': 'node-2' },
    }))
    const getJob = vi.fn(async () => ({
      attempts: 2,
      error: { message: 'container exited with code 2: Error: Failed to initialize cache', kind: 'permanent' },
      result: { exit_code: 2, stdout: 'error: Failed to initialize cache', stderr: '' },
      family: null,
    }))

    const mounted = await mount(taskPanel(getTask, getJob), { taskId: 'failed-run', open: true })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    const message = 'container exited with code 2: Error: Failed to initialize cache'
    expect(text.split(message)).toHaveLength(2)
    expect(text).not.toContain('system logs')
    expect(text).toContain('permanent')
    expect(text).toContain('2 attempts')
    expect(text).toContain('output')
    expect(text).not.toContain('no stderr captured')
    expect(text).toContain('Queued node node-2')
    mounted.app.unmount()
  })

  it('words every run state for the reader', async () => {
    const nodeTag = 'aruna-engine.org/label/aruna-engine.org/node'
    const base = {
      id: 'run',
      executors: [{ image: 'alpine', command: ['sh'] }],
      inputs: [],
      outputs: [],
      logs: [],
      tags: {},
    }
    const started = new Date(Date.now() - 60000).toISOString()
    const cases: Array<[Record<string, unknown>, Record<string, unknown>, string]> = [
      [{ state: 'QUEUED', tags: { [nodeTag]: 'node-2' } }, {}, 'Waiting for a response from node-2'],
      [{ state: 'QUEUED' }, {}, 'Queued, waiting for a node'],
      [{ state: 'INITIALIZING' }, { progress: { current: 2, total: 5, unit: 'inputs' } }, 'Copying inputs · 2 / 5 inputs'],
      [{ state: 'INITIALIZING' }, {}, 'Copying inputs'],
      [{ state: 'RUNNING', logs: [{ start_time: started, logs: [], outputs: [] }] }, {}, 'Running for'],
      [{ state: 'COMPLETE' }, {}, 'Completed'],
      [{ state: 'CANCELED' }, {}, 'Cancelled'],
      [
        { state: 'EXECUTOR_ERROR', logs: [{ logs: [{ exit_code: 2, stderr: 'Traceback\nValueError: bad input' }], outputs: [] }] },
        {},
        'ValueError: bad input',
      ],
    ]
    const wake = vi.spyOn(Poll, 'onWake').mockImplementation(() => () => {})
    const followSpy = vi.spyOn(Poll, 'follow').mockImplementation(() => () => {})

    for (const [task, job, expected] of cases) {
      const getTask = vi.fn(async () => ({ ...base, ...task }))
      const getJob = vi.fn(async () => ({ family: null, ...job }))
      const mounted = await mount(taskPanel(getTask, getJob), { taskId: 'run', open: true })
      const text = content(mounted.root).replace(/\s+/g, ' ')

      expect(mounted.errors).toEqual([])
      expect(text, `state ${task.state}`).toContain(expected)
      mounted.app.unmount()
    }
    wake.mockRestore()
    followSpy.mockRestore()
  })

  it('offers Run again only once the run ended', async () => {
    const base = {
      id: 'run',
      executors: [{ image: 'alpine', command: ['sh'] }],
      inputs: [],
      outputs: [],
      logs: [],
      tags: {},
    }
    const getJob = vi.fn(async () => ({ family: null }))
    const wake = vi.spyOn(Poll, 'onWake').mockImplementation(() => () => {})
    const followSpy = vi.spyOn(Poll, 'follow').mockImplementation(() => () => {})

    const running = await mount(taskPanel(vi.fn(async () => ({ ...base, state: 'RUNNING' })), getJob), {
      taskId: 'run',
      open: true,
    })
    expect(content(running.root)).not.toContain('Run again')
    expect(content(running.root)).toContain('Cancel run')
    running.app.unmount()

    const done = await mount(taskPanel(vi.fn(async () => ({ ...base, state: 'COMPLETE' })), getJob), {
      taskId: 'run',
      open: true,
    })
    expect(content(done.root)).toContain('Run again')
    expect(content(done.root)).not.toContain('Cancel run')
    done.app.unmount()
    wake.mockRestore()
    followSpy.mockRestore()
  })

  it('previews the output tail and opens the full log', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const getTask = vi.fn(async () => ({
      id: 'run',
      state: 'COMPLETE',
      executors: [{ image: 'alpine', command: ['sh'] }],
      inputs: [],
      outputs: [],
      logs: [{ logs: [{ exit_code: 0, stdout: lines, stderr: 'warn one\nwarn two' }], outputs: [] }],
      tags: {},
    }))
    const getJob = vi.fn(async () => ({ family: null }))

    const mounted = await mount(taskPanel(getTask, getJob), { taskId: 'run', open: true })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('line 20')
    expect(text).toContain('line 13')
    expect(text).not.toContain('line 12')
    expect(text).toContain('stderr: 2 lines · last: warn two')
    expect(text).toContain('Open full log')
    mounted.app.unmount()
  })

  it('filters the full log and numbers its lines', async () => {
    const RunLogDialog = compileClientComponent(new URL('../compute/RunLogDialog.vue', import.meta.url), {
      vue: VueRuntime,
      '@lucide/vue': icons,
      '@/components/ui/DetailDialog.vue': moduleDefault(OpenPassThroughStub),
      '@/components/ui/DialogTitle.vue': moduleDefault(PassThroughStub),
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
      '@/components/ui/Input.vue': moduleDefault(InputStub),
      '@/components/ui/Tabs.vue': moduleDefault(PassThroughStub),
      '@/components/ui/TabsList.vue': moduleDefault(PassThroughStub),
      '@/components/ui/TabsTrigger.vue': moduleDefault(PassThroughStub),
    })
    const streams = [
      { key: 'stdout', label: 'stdout', text: '2026-09-04T14:03:19Z first line\n2026-09-04T14:03:20Z second line' },
      { key: 'stderr', label: 'stderr', text: 'boom' },
    ]

    const mounted = await mount(RunLogDialog, { open: true, streams, name: 'align-and-count' })
    let text = content(mounted.root).replace(/\s+/g, ' ')

    expect(mounted.errors).toEqual([])
    expect(text).toContain('stdout (2)')
    expect(text).toContain('stderr (1)')
    expect(text).toContain('2 of 2 lines shown')
    expect(text).toContain('Hide timestamps')

    const find = findAll(mounted.root, (node) => node.tag === 'input')[0]!
    await (find.props.onInput as (event: unknown) => void)({ target: { value: 'second' } })
    await nextTick()
    text = content(mounted.root).replace(/\s+/g, ' ')

    expect(text).toContain('1 of 2 lines shown')
    expect(text).not.toContain('first line')
    mounted.app.unmount()
  })

  it('keeps one section order whatever the state', async () => {
    // No section folds and none moves: the run reads the same way throughout.
    const running = vi.fn(async () => ({
      id: 'live-run',
      state: 'RUNNING',
      executors: [{ image: 'alpine', command: ['sh'] }],
      inputs: [],
      outputs: [],
      logs: [],
      tags: {},
      resources: { cpu_cores: 2 },
    }))
    const done = vi.fn(async () => ({ ...(await running()), state: 'COMPLETE' }))
    const getJob = vi.fn(async () => ({ family }))
    const wake = vi.spyOn(Poll, 'onWake').mockImplementation(() => () => {})
    const followSpy = vi.spyOn(Poll, 'follow').mockImplementation(() => () => {})

    for (const getTask of [running, done]) {
      const mounted = await mount(taskPanel(getTask, getJob), { taskId: 'live-run', open: true })
      const text = content(mounted.root)

      expect(mounted.errors).toEqual([])
      expect(text.indexOf('Progress')).toBeLessThan(text.indexOf('Placement'))
      expect(text.indexOf('Placement')).toBeLessThan(text.indexOf('Executions'))
      expect(text.indexOf('Executions')).toBeLessThan(text.indexOf('Output'))
      expect(text.indexOf('Outputs')).toBeLessThan(text.indexOf('Request'))
      expect(text).toContain('2 cores')
      mounted.app.unmount()
    }
    wake.mockRestore()
    followSpy.mockRestore()
  })

  it('refreshes the native job with every poll', async () => {
    // Placement and the family state must move with the run, not freeze at open.
    const getTask = vi.fn(async () => ({
      id: 'live-run',
      state: 'RUNNING',
      executors: [{ image: 'alpine', command: ['sh'] }],
      inputs: [],
      outputs: [],
      logs: [],
      tags: {},
    }))
    const getJob = vi.fn(async () => ({ family: null }))
    const wake = vi.spyOn(Poll, 'onWake').mockImplementation(() => () => {})
    let tick: (() => Promise<void>) | undefined
    const followSpy = vi.spyOn(Poll, 'follow').mockImplementation((run) => {
      tick = run
      return () => {}
    })

    const mounted = await mount(taskPanel(getTask, getJob), { taskId: 'live-run', open: true })
    expect(getJob).toHaveBeenCalledTimes(1)
    await tick?.()
    expect(getTask).toHaveBeenCalledTimes(2)
    expect(getJob).toHaveBeenCalledTimes(2)
    expect(mounted.errors).toEqual([])
    wake.mockRestore()
    followSpy.mockRestore()
    mounted.app.unmount()
  })
})
