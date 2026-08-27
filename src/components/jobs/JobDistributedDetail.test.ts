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
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import type { JobAuditResponse, JobFamilyResponse } from '@/lib/jobs'

const PassThroughStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const OpenPassThroughStub = defineComponent({
  props: { open: Boolean },
  setup(props, { slots }) {
    return () => (props.open ? h('div', slots.default?.()) : null)
  },
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
const JobFamilyStub = defineComponent(() => () => h('section', 'native family detail'))
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
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
      bucket: 'ws-bucket',
      key: 'reports/known.html',
      version_id: 'version-known',
      execution_id: 'canonical-execution',
      container_path: '/outputs/known.html',
      size: 2048,
      digest: 'digest-known',
      endpoint_url: 'https://owner.node.test',
    },
    {
      bucket: 'ws-bucket',
      key: 'reports/orphan.html',
      version_id: 'version-orphan',
      execution_id: 'canonical-execution',
      size: 1024,
      endpoint_url: null,
    },
  ],
  revision: 3,
  projection_digest: 'projection-digest',
  eventually_consistent: true,
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
    sealed_at_ms: 1755500000000,
  },
}

describe('distributed job detail components', () => {
  const familyModules = {
    vue: VueRuntime,
    'vue-router': { RouterLink: RouterLinkStub },
    '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
    '@/components/nodes/CopyButton.vue': moduleDefault(PassThroughStub),
    '@/components/jobs/JobStateBadge.vue': moduleDefault(JobStateBadgeStub),
    '@/lib/jobs': Jobs,
    '@/lib/utils': Utils,
  }

  it('labels planner transfer values as plan-time estimates', async () => {
    const JobFamilySection = compileClientComponent(
      new URL('./JobFamilySection.vue', import.meta.url),
      familyModules,
    )

    const mounted = await mount(JobFamilySection, { family })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Placement')
    expect(text).toContain('Estimated at planning time')
    expect(text).toContain('Data-to-compute')
    expect(text).toContain('At least one input had no usable copy on the chosen node')
    expect(text).toContain('4 MB')
    expect(text).toContain('340 ms')
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
    const JobFamilySection = compileClientComponent(
      new URL('./JobFamilySection.vue', import.meta.url),
      familyModules,
    )
    const local: JobFamilyResponse = {
      ...family,
      placement: { ...family.placement!, estimated_transfer_bytes: 0, estimated_transfer_ms: 0 },
    }

    const mounted = await mount(JobFamilySection, { family: local })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Compute-to-data')
    expect(text).toContain('the plan expected to move no bytes')
    mounted.app.unmount()
  })

  it('says no local plan exists rather than claiming none was made', async () => {
    const JobFamilySection = compileClientComponent(
      new URL('./JobFamilySection.vue', import.meta.url),
      familyModules,
    )
    const { placement: _placement, ...unplanned } = family

    const mounted = await mount(JobFamilySection, { family: unplanned })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(text).toContain('Not placed')
    expect(text).toContain('No local placement record for this family')
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
    expect(text).toContain('Download run crate')
    expect(text).toContain('2 KB')
    expect(text).toContain('abc123')
    mounted.app.unmount()
  })

  it('names each unavailable archive state instead of failing', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ state: 'pending', jobState: 'running' }, 'the job\n      is running'],
      [{ state: 'expired' }, 'retention window has passed'],
      [{ state: 'unauthorized' }, 'may not read the run crate'],
      [{ state: 'absent' }, 'No run crate archive is kept'],
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
      expect(text).not.toContain('Download run crate')
      mounted.app.unmount()
    }
  })

  it('renders the placement tags and hides the block without them', async () => {
    const modules = {
      vue: VueRuntime,
      'vue-router': { RouterLink: RouterLinkStub },
      '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
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
      },
    })
    const taggedText = content(tagged.root)

    expect(tagged.errors).toEqual([])
    expect(taggedText).toContain('Compute-to-data')
    expect(taggedText).toContain('succeeded')
    expect(taggedText).toContain('docker')
    expect(taggedText).toContain('region=eu-central')
    tagged.app.unmount()

    const untagged = await mount(TesPlacementTags, {
      tags: { 'aruna-engine.org/group': 'group' },
    })

    expect(untagged.errors).toEqual([])
    // Only the v-if placeholder comment remains, no badges and no job link.
    expect(untagged.root.children.every((node) => node.kind === 'comment')).toBe(true)
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
      '@/components/ui/Dialog.vue': moduleDefault(OpenPassThroughStub),
      '@/components/ui/DialogClose.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogContent.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogDescription.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogFooter.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogHeader.vue': moduleDefault(PassThroughStub),
      '@/components/ui/DialogTitle.vue': moduleDefault(PassThroughStub),
      '@/components/ui/ErrorPanel.vue': moduleDefault(ErrorPanelStub),
      '@/components/ui/Skeleton.vue': moduleDefault(PassThroughStub),
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
    const TaskDetailPanel = compileClientComponent(
      new URL('../compute/TaskDetailPanel.vue', import.meta.url),
      {
        vue: VueRuntime,
        'vue-router': { RouterLink: RouterLinkStub, useRouter: () => ({ push: vi.fn() }) },
        '@lucide/vue': icons,
        '@/components/ui/DetailDialog.vue': moduleDefault(OpenPassThroughStub),
        '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
        '@/components/ui/Button.vue': moduleDefault(ButtonStub),
        '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
        '@/components/ui/Skeleton.vue': moduleDefault(PassThroughStub),
        '@/components/ui/ErrorPanel.vue': moduleDefault(ErrorPanelStub),
        '@/components/nodes/CopyButton.vue': moduleDefault(PassThroughStub),
        '@/components/ui/ExternalLink.vue': moduleDefault(PassThroughStub),
        '@/components/jobs/JobFamilySection.vue': moduleDefault(JobFamilyStub),
        '@/components/compute/TaskStateBadge.vue': moduleDefault(JobStateBadgeStub),
        '@/components/compute/TesPlacementTags.vue': moduleDefault(PassThroughStub),
        '@/components/onboarding/ClaimWatchStep.vue': moduleDefault(PassThroughStub),
        '@/composables/useTes': {
          isTesUnsupported: () => false,
          useTes: () => ({ getTask, cancelTask: vi.fn(), busy: ref(false) }),
        },
        '@/composables/useJobs': { useJobs: () => ({ getJob }) },
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
        '@/lib/quickRuntimes': { detectQuickRun: () => false },
        '@/lib/tes': Tes,
        '@/lib/utils': Utils,
      },
    )

    const mounted = await mount(TaskDetailPanel, { taskId: 'native-job-id', open: true })
    const text = content(mounted.root)

    expect(mounted.errors).toEqual([])
    expect(getJob).toHaveBeenCalledWith('native-job-id')
    expect(text).toContain('Distributed execution detail could not be loaded.')
    expect(text).not.toContain('native family detail')
    expect(text).not.toContain('ERROR:')
    mounted.app.unmount()
  })
})
