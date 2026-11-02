import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  input,
  moduleDefault,
  mountApp,
  nodes,
  refreshButton,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import { useSavedRuns } from '@/composables/useSavedRuns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as VueUse from '@vueuse/core'
import { useRefresh } from '@/composables/useRefresh'
import * as CustomRun from '@/composables/useCustomRun'
import * as Api from '@/lib/api'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as OnboardingConfig from '@/lib/onboarding-config'
import * as Jobs from '@/lib/jobs'
import * as NativeSubmit from '@/lib/nativeSubmit'
import * as QuickRuntimes from '@/lib/quickRuntimes'
import * as RunPaths from '@/lib/runPaths'
import * as RunTarget from '@/lib/runTarget'
import * as Shellwords from '@/lib/shellwords'
import * as ContentIdentity from '@/lib/contentIdentity'
import * as Distribution from '@/lib/distribution'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'

vi.stubGlobal('Document', class {})
vi.stubGlobal('ShadowRoot', class {})

const GenericStub = defineComponent(() => () => h('div'))
const PassThroughStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: props.modelValue,
          onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value)),
        },
        (props.options as Array<{ value: string; label: string }>).map((option) =>
          h('option', { value: option.value }, option.label),
        ),
      )
  },
})
const SwitchStub = defineComponent((_, { attrs }) => () => h('input', { ...attrs, type: 'checkbox' }))
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()])
  },
})
const TaskJsonPreviewStub = defineComponent({
  props: { title: { type: String, required: true }, task: { type: Object, required: true } },
  setup(props) {
    return () => h('section', [h('h2', props.title), h('pre', JSON.stringify(props.task, null, 2))])
  },
})
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const KindSelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        (props.options as Array<{ value: string; title: string }>).map((option) =>
          h('button', { onClick: () => emit('update:modelValue', option.value) }, option.title),
        ),
      )
  },
})
const SecretPanelStub = defineComponent({
  props: { secret: String },
  setup: (props) => () => h('div', props.secret),
})
const CodeSnippetStub = defineComponent({
  props: { title: String, code: String },
  setup: (props) => () => h('section', [h('h2', props.title), h('pre', props.code)]),
})
const EmptyStateStub = defineComponent({
  props: { title: String },
  setup: (props) => () => h('div', props.title),
})
const NoticeStub = defineComponent({
  props: { tone: String, title: String, lines: { type: Array, default: () => [] } },
  setup: (props, { slots }) => () =>
    h('div', { role: props.tone === 'error' ? 'alert' : 'status' }, [
      props.title ? h('p', props.title) : null,
      slots.default?.(),
      (props.lines as string[]).map((line) => h('li', line)),
    ]),
})
const FilterChipsStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'div',
      (props.options as Array<{ value: string; label: string }>).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
      ),
    ),
})
const SegmentedStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'div',
      (props.options as Array<{ value: string; label: string }>).map((option) =>
        h(
          'button',
          { 'aria-pressed': option.value === props.modelValue, onClick: () => emit('update:modelValue', option.value) },
          option.label,
        ),
      ),
    ),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})

// Bucket holders the federated search answers; this node unless a test says otherwise. The
// empty query lists the run group's buckets.
const searchBuckets = vi.fn(async (q: string, _options?: { cursor?: string; groupId?: string }) => ({
  hits: [{ bucket: q || 'results', node_id: 'node-id', group_id: 'group-id' }] as Array<{ bucket: string; node_id: string; group_id: string; set_id?: string }>,
  nodes_failed: 0,
  next_cursor: null as string | null,
}))
const getBucketDistribution = vi.fn(async (_bucket: string, _signal?: AbortSignal, _nodeId?: string | null) => ({
  members: [] as Array<{ node_id: string; state: string; member_id?: string }>,
  ranges: [] as Array<{ range_id: string; lower: string; upper?: string; coordinator: string; replicas: string[] }>,
}))
type ObjectPage = { objects: Array<{ key: string; version_id: string }>; next_cursor: string | null; stale_ranges?: unknown[] }
const listBucketObjects = vi.fn(async (_bucket: string, _query: { prefix?: string }, _nodeId?: string | null): Promise<ObjectPage> => ({
  objects: [],
  next_cursor: null,
}))
const sessionEpoch = ref(0)
const useArunaModule = {
  useAruna: () => ({
    sessionEpoch,
    searchBuckets,
    getBucketDistribution,
    listBucketObjects,
    apiBaseUrl: ref('https://node.example.org/api/v1'),
    authToken: ref('realm-token'),
    bootstrapped: ref(true),
    currentUser: ref({ id: 'user-id', display_name: 'Test User' }),
    myGroups: ref([{ id: 'group-id', name: 'Test Group' }]),
    canManageOnboarding: ref(true),
    isManagementNode: ref(true),
    nodeInfo: ref({
      node: { peer_id: 'node-id', capabilities: 'management', realm_id: 'realm' },
      services: { interfaces: { rest: { url: 'https://node.example.org/api/v1' } } },
    }),
    realmInfo: ref({
      nodes: [{ node_id: 'node-id', kind: 'management', info: { urls: { api: 'https://node.example.org/api/v1' } } }],
    }),
  }),
}
const useNodeOnboardingModule = {
  NEVER_EXPIRES_AFTER: 10_000_000_000,
  secretStatus: () => 'outstanding',
  useNodeOnboarding: () => ({
    secrets: ref([]),
    listError: ref(null),
    listing: ref(false),
    minting: ref(false),
    mintError: ref(null),
    revokingIds: ref(new Set<string>()),
    watch: ref({ phase: 'idle', enrollmentId: null, claimedBy: null, claimedIsNode: false, lastError: null }),
    refreshSecrets: vi.fn(async () => undefined),
    mint: vi.fn(async () => ({
      response: { onboarding_secret: 'test-secret', expires_at: 4_000_000_000, mode: 'Management' },
      enrollmentId: 'enrollment-id',
    })),
    revoke: vi.fn(),
    startWatch: vi.fn(),
    resetWatch: vi.fn(),
  }),
}
const icons = new Proxy({}, { get: () => GenericStub })
const RouteStub = defineComponent(() => () => h('div'))

const Input = compileClientComponent(new URL('../components/ui/Input.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
  '@vueuse/core': VueUse,
})
const useAuthModule = {
  useAuth: () => ({ stage: ref('authenticated'), authPending: ref(false), signIn: vi.fn() }),
}
const ComputeGates = compileClientComponent(
  new URL('../components/compute/ComputeGates.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@lucide/vue': icons,
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
    '@/components/ui/Skeleton.vue': moduleDefault(GenericStub),
    '@/composables/useAruna': useArunaModule,
    '@/composables/useAuth': useAuthModule,
  },
)

// One docker node, so the placement section has something to match.
const realmNodes = ref([
  {
    nodeId: 'node-id',
    label: 'Node',
    executorKinds: ['docker'],
    info: { labels: { region: 'eu-central' } },
  },
])

// Desktop-only run target, driven by the test: on the web it never appears.
const runTargetChoice = ref<'realm' | 'local'>('realm')
const runTargetAvailable = ref(false)
const runningLocally = computed(() => runTargetAvailable.value && runTargetChoice.value === 'local')
const runTarget = {
  target: runTargetChoice,
  available: runTargetAvailable,
  local: runningLocally,
  localClient: computed(() =>
    runningLocally.value ? { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' } : null,
  ),
  compute: ref({ enabled: true, backend: 'docker', running: 0 }),
}
const submitJob = vi.fn(async () => ({ job_id: 'local-job-id', created: true }))
const createTask = vi.fn(async () => ({ id: 'task-id' }))
const s3 = {
  hasActiveKey: ref(true),
  endpoint: ref('https://s3.example.org'),
  listBuckets: vi.fn(async () => [{ name: 'results' }]),
  ensureSession: vi.fn(async () => undefined),
  getObjectText: vi.fn(async () => ''),
  referenceForNode: vi.fn(async (nodeId: string, groupId: string) => ({ nodeId, groupId, accessKeyId: 'k-b' })),
  putTextObject: vi.fn(async () => ({ versionId: 'v1' })),
  createBucket: vi.fn(async () => undefined),
  canWrite: () => true,
  nodeIdFor: () => 'node-id',
}

const sharedUi = {
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Tooltip.vue': moduleDefault(PassThroughStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(SelectStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/FilterChips.vue': moduleDefault(FilterChipsStub),
  '@/components/ui/Skeleton.vue': moduleDefault(GenericStub),
  '@/components/ui/DocsLink.vue': moduleDefault(GenericStub),
  '@/components/ui/IconButton.vue': moduleDefault(ButtonStub),
  '@/components/ui/OptionToggle.vue': moduleDefault(SegmentedStub),
}
const cardModules = {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedUi,
  '@/components/compute/ContainerFsTree.vue': moduleDefault(GenericStub),
  '@/components/compute/TesInputsEditor.vue': moduleDefault(GenericStub),
  '@/components/compute/TaskJsonPreview.vue': moduleDefault(TaskJsonPreviewStub),
  '@/composables/useCustomRun': CustomRun,
  '@/lib/tes': Tes,
  '@/lib/runPaths': RunPaths,
  '@/lib/quickRuntimes': QuickRuntimes,
  '@/lib/shellwords': Shellwords,
  '@/lib/bucketName': { bucketNameProblem: () => null, objectKeyProblem: () => null },
}
const card = (path: string) => moduleDefault(compileClientComponent(new URL(path, import.meta.url), cardModules))
const RunSection = card('../components/compute/run/RunSection.vue')
const RunTile = card('../components/compute/run/RunTile.vue')
const AiMark = card('../components/compute/run/AiMark.vue')
const PathChips = card('../components/compute/run/PathChips.vue')
const withParts = {
  ...cardModules,
  '@/components/compute/run/RunSection.vue': RunSection,
  '@/components/compute/run/RunTile.vue': RunTile,
  '@/components/compute/run/AiMark.vue': AiMark,
  '@/components/compute/run/PathChips.vue': PathChips,
  '@/components/compute/run/DependenciesTab.vue': moduleDefault(GenericStub),
  '@/components/compute/run/ResultsHome.vue': moduleDefault(GenericStub),
  '@/components/compute/ScriptEditor.vue': moduleDefault(GenericStub),
  '@/lib/chunk-recovery': { asyncChunkError: () => {} },
}
const part = (path: string) => moduleDefault(compileClientComponent(new URL(path, import.meta.url), withParts))

const ComputeSubmitView = compileClientComponent(new URL('./ComputeSubmitView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedUi,
  '@/components/compute/run/RunBasics.vue': part('../components/compute/run/RunBasics.vue'),
  '@/components/compute/run/ExecutorCard.vue': part('../components/compute/run/ExecutorCard.vue'),
  '@/components/compute/run/ScriptCard.vue': part('../components/compute/run/ScriptCard.vue'),
  '@/components/compute/run/FilesystemCard.vue': part('../components/compute/run/FilesystemCard.vue'),
  '@/components/compute/run/ResourcesCard.vue': part('../components/compute/run/ResourcesCard.vue'),
  '@/components/compute/run/PlacementCard.vue': part('../components/compute/run/PlacementCard.vue'),
  '@/components/compute/run/RunFooter.vue': part('../components/compute/run/RunFooter.vue'),
  '@/components/compute/run/RequestDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/run/ScriptPickerDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/SaveRunDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/run/SavedRunStart.vue': moduleDefault(GenericStub),
  '@/components/compute/TesDataRefDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/RerunPrefillNote.vue': moduleDefault(GenericStub),
  '@/components/compute/ComputeGates.vue': moduleDefault(ComputeGates),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(DialogStub),
  '@/components/assistant/AskAiButton.vue': moduleDefault(GenericStub),
  '@/composables/useCustomRun': CustomRun,
  '@/composables/useDatabases': { useDatabases: () => ({ rows: ref([]), state: ref('ready'), ensure: () => {} }) },
  '@/composables/useTes': {
    isTesUnsupported: () => false,
    useTes: () => ({ tesEnabled: ref(true), busy: ref(false), createTask, getTask: vi.fn() }),
  },
  '@/composables/useAruna': useArunaModule,
  '@/lib/contentIdentity': ContentIdentity,
  '@/lib/distribution': Distribution,
  '@/lib/api': Api,
  '@/composables/useComputeDataView': { useComputeDataView: () => ref('table') },
  '@/composables/useS3': { useS3: () => s3, s3ErrorMessage: (error: unknown) => String(error) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: realmNodes,
      localNodeId: ref('node-id'),
      isTarget: () => true,
      isLocalNode: (id: string) => id === 'node-id',
      nodeById: (id: string | null) => (id === 'node-b' ? { apiBase: 'https://node-b.example.org/api/v1' } : id === 'node-c' ? { apiBase: null } : null),
      displayName: (id: string) => `Node ${id}`,
    }),
  },
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ shortName: 'Realm' }) }) },
  '@/composables/useRunTarget': { useRunTarget: () => runTarget },
  '@/composables/useAssistantRunForm': { provideRunFormBridge: () => {} },
  '@/lib/runFormBridge': { createRunFormBridge: () => ({}) },
  '@/lib/tes': Tes,
  '@/lib/utils': Utils,
  '@/lib/workspaces': Workspaces,
  '@/lib/nativeSubmit': NativeSubmit,
  '@/lib/runTarget': RunTarget,
  '@/lib/jobs': { ...Jobs, submitJob },
})
const AdminOnboardingView = compileClientComponent(new URL('./AdminOnboardingView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedUi,
  '@/components/ui/ErrorPanel.vue': moduleDefault(GenericStub),
  '@/components/ui/SectionHeading.vue': moduleDefault(GenericStub),
  '@/components/onboarding/KindSelectStep.vue': moduleDefault(KindSelectStub),
  '@/components/onboarding/SecretPanel.vue': moduleDefault(SecretPanelStub),
  '@/components/onboarding/CodeSnippet.vue': moduleDefault(CodeSnippetStub),
  '@/components/onboarding/ClaimWatchStep.vue': moduleDefault(GenericStub),
  '@/components/onboarding/DeviceLane.vue': moduleDefault(GenericStub),
  '@/components/onboarding/SecretsTable.vue': moduleDefault(GenericStub),
  '@/components/onboarding/WizardSteps.vue': moduleDefault(GenericStub),
  '@/composables/useAruna': useArunaModule,
  '@/composables/useNodeOnboarding': useNodeOnboardingModule,
  '@/composables/useRefresh': { useRefresh },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(async () => []), cachedUser: () => null }),
  },
  '@/lib/onboarding-config': OnboardingConfig,
  '@/components/nodes/node-display': NodeDisplay,
  '@/lib/utils': Utils,
  '@/lib/api': Api,
})

function runButton(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'button' && content(node).trim() === 'Run')
}

async function mount(component: Component, path?: string) {
  const router = path
    ? createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/app/compute', name: 'compute', component: RouteStub },
          { path: '/app/compute/new', name: 'compute-new', component: RouteStub },
          { path: '/app/compute/:taskId', name: 'task', component: RouteStub },
          { path: '/app/runs', name: 'runs', component: RouteStub },
          { path: '/app/runs/:jobId', name: 'run', component: RouteStub },
          { path: '/app/admin', name: 'admin', component: RouteStub },
          { path: '/app/status', name: 'status', component: RouteStub },
        ],
      })
    : undefined
  if (router && path) {
    await router.push(path)
    await router.isReady()
  }
  return { ...(await mountApp(component, { router })), router }
}

/** Everything a realm run needs, filled through the page's own controls. */
async function fillValidRun(root: HostNode) {
  await typeValue(input(root, 'placeholder', 'ubuntu:22.04'), 'alpine:3.20')
  await typeValue(input(root, 'aria-label', 'Command line'), 'echo hello')
  await click(button(root, 'Add output'))
  await typeValue(input(root, 'aria-label', 'Container path to capture'), '/work/out/result.txt')
  await typeValue(input(root, 'aria-label', 'Destination key'), 'runs/result.txt')
  await flush()
}

beforeEach(() => {
  runTargetAvailable.value = false
  runTargetChoice.value = 'realm'
  submitJob.mockClear()
  createTask.mockClear()
  s3.putTextObject.mockClear()
})

describe('run page', () => {
  it('documents that type="number" Input values are emitted as numbers', async () => {
    let emitted: string | number | undefined
    const Harness = defineComponent(() => {
      const value = ref<string | number>('')
      return () =>
        h(Input, {
          modelValue: value.value,
          'onUpdate:modelValue': (next: string | number) => {
            value.value = next
            emitted = next
          },
          type: 'number',
          placeholder: 'numeric-contract',
        })
    })
    const mounted = await mount(Harness)

    await typeValue(input(mounted.root, 'placeholder', 'numeric-contract'), '12.5')

    expect(emitted).toBe(12.5)
    expect(typeof emitted).toBe('number')
    mounted.app.unmount()
  })

  it('shows every section of the run on one page, without steps', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    const page = content(mounted.root)

    expect(page).toContain('New run')
    for (const section of ['Run', 'Executor', 'Container filesystem', 'Resources', 'Placement']) {
      expect(page).toContain(section)
    }
    expect(page).not.toContain('Continue')
    expect(page).not.toContain('Review')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('names what the run still needs and refuses to send it', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')

    expect(content(mounted.root)).toContain('still needed')
    expect(content(mounted.root)).toContain('Image is missing')
    // A missing capture is a warning, not a problem that holds the run back.
    expect(content(mounted.root)).not.toContain('Capture at least one output')
    expect(content(mounted.root)).toContain('No output captured')
    // Run is never disabled; with problems it jumps instead of submitting.
    expect(runButton(mounted.root).props.disabled).toBeFalsy()
    await click(runButton(mounted.root))
    await flush()

    expect(createTask).not.toHaveBeenCalled()
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('reports a ready run and submits it to the task API', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    expect(content(mounted.root)).toContain('Ready')
    expect(content(mounted.root)).not.toContain('still needed')

    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(submitJob).not.toHaveBeenCalled()
    expect(createTask).toHaveBeenCalledTimes(1)
    const submitted = (createTask.mock.calls[0] as unknown[])[0] as Tes.TesTask
    expect(submitted.outputs).toEqual([
      { url: 's3://results/runs/result.txt', path: '/work/out/result.txt', type: 'FILE' },
    ])
    expect(submitted.executors?.[0]).toMatchObject({ image: 'alpine:3.20', command: ['echo', 'hello'] })
    expect(submitted.resources).toEqual({ cpu_cores: 1, ram_gb: 2, disk_gb: 10 })
    expect(mounted.router!.currentRoute.value.name).toBe('task')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('sends the run to the node holding its buckets', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)
    searchBuckets.mockImplementationOnce(async (q: string) => ({ hits: [{ bucket: q, node_id: 'node-b', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))

    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(searchBuckets).toHaveBeenCalledWith('results', { limit: 50, groupId: 'group-id' })
    expect(createTask).toHaveBeenCalledWith(expect.anything(), 'https://node-b.example.org/api/v1')
    mounted.app.unmount()
  })

  it('follows the bucket search to its last page before routing', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)
    searchBuckets.mockImplementationOnce(async () => ({ hits: [], nodes_failed: 0, next_cursor: 'page-2' }))
    searchBuckets.mockImplementationOnce(async (q: string) => ({ hits: [{ bucket: q, node_id: 'node-b', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))

    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(searchBuckets).toHaveBeenLastCalledWith('results', { limit: 50, cursor: 'page-2', groupId: 'group-id' })
    expect(createTask).toHaveBeenCalledWith(expect.anything(), 'https://node-b.example.org/api/v1')
    mounted.app.unmount()
  })

  it('counts every ready member of a distributed bucket the search shows once', async () => {
    // The search answers one hit per set, from the member that sorts first.
    getBucketDistribution.mockResolvedValueOnce({ members: [{ node_id: 'node-b', state: 'ready' }, { node_id: 'node-id', state: 'ready' }], ranges: [] })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)
    searchBuckets.mockImplementationOnce(async (q: string) => ({
      hits: [{ bucket: q, node_id: 'node-b', group_id: 'group-id', set_id: 'set-1' }],
      nodes_failed: 0,
      next_cursor: null,
    }))

    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(getBucketDistribution).toHaveBeenCalledWith('results', undefined, 'node-b')
    expect(createTask).toHaveBeenCalledWith(expect.anything(), undefined)
    mounted.app.unmount()
  })

  it('writes results only to a bucket of the run\'s own group', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)
    searchBuckets.mockImplementationOnce(async (q: string) => ({
      hits: [{ bucket: q, node_id: 'node-id', group_id: 'other-group' }, { bucket: q, node_id: 'node-b', group_id: 'group-id' }],
      nodes_failed: 0,
      next_cursor: null,
    }))

    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(createTask).toHaveBeenCalledWith(expect.anything(), 'https://node-b.example.org/api/v1')
    mounted.app.unmount()
  })

  it('starts nothing when the holder lookup fails or the holder names no address', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    searchBuckets.mockRejectedValueOnce(new Error('search is down'))
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(content(mounted.root)).toContain('search is down')

    searchBuckets.mockImplementationOnce(async (q: string) => ({ hits: [{ bucket: q, node_id: 'node-c', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(content(mounted.root)).toContain('Node node-c holds the run\'s buckets but names no API address')

    searchBuckets.mockImplementationOnce(async () => ({ hits: [], nodes_failed: 0, next_cursor: null }))
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(content(mounted.root)).toContain('No node holds bucket results')

    // A last page some node did not answer leaves the holder unknown, not absent.
    searchBuckets.mockImplementationOnce(async () => ({ hits: [], nodes_failed: 1, next_cursor: null }))
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(content(mounted.root)).toContain('did not reach every node, so the node holding results is unknown')
    expect(createTask).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('sends nothing for a session that changed while the holder was looked up', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    searchBuckets.mockImplementationOnce(async () => {
      sessionEpoch.value += 1
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(content(mounted.root)).toContain('The session changed while the run was being prepared')

    searchBuckets.mockImplementationOnce(async (q: string) => {
      sessionEpoch.value += 1
      return { hits: [{ bucket: q, node_id: 'node-id', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }
    })
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(createTask).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('The session changed while the run was being prepared')
    mounted.app.unmount()
  })

  it('names the node refusal next to Run', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    createTask.mockRejectedValueOnce(new Api.ApiError(400, 'invalid workspace: input object not found'))
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    const summary = element(mounted.root, (node) => node.tag === 'aside' && node.props['aria-labelledby'] === 'run-summary-heading')
    expect(content(summary)).toContain('invalid workspace: input object not found')
    mounted.app.unmount()
  })

  it('calls a sent run unknown when its answer is lost, and quiet after the session changed', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    createTask.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(content(mounted.root)).toContain('It may have started: check the run list')
    expect(content(mounted.root)).not.toContain('not started')

    createTask.mockImplementationOnce(async () => {
      sessionEpoch.value += 1
      return { id: 'stale-task' }
    })
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(mounted.router!.currentRoute.value.fullPath).toBe('/app/compute/new')
    expect(content(mounted.root)).not.toContain('session changed')
    mounted.app.unmount()
  })

  it('lets an unedited destination key follow the run name', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await click(button(mounted.root, 'Add output'))
    const key = () => (input(mounted.root, 'aria-label', 'Destination key') as unknown as { value: string }).value
    expect(key()).toBe('quickruns/run/result.txt')

    await typeValue(input(mounted.root, 'placeholder', 'align-and-count'), 'count reads')
    await flush()

    expect(key()).toBe('quickruns/count-reads/result.txt')
    mounted.app.unmount()
  })

  it('starts a saved run with only its asked input open', async () => {
    useSavedRuns().save({
      id: 'r1', name: 'Align', savedAt: '2026-10-28T10:00:00Z',
      task: {
        name: 'Align',
        executors: [{ image: 'alpine:3.20', command: ['echo', 'hi'] }],
        inputs: [
          { name: 'genome', path: '/data/genome.fna', url: 's3://lab/genome.fna', type: 'FILE' },
          { name: 'ref', path: '/data/ref.fna', url: 's3://lab/ref.fna', type: 'FILE' },
        ],
      },
      ask: { inputs: ['/data/genome.fna'], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(content(mounted.root)).toContain('Choose genome.fna')
    expect(content(mounted.root)).not.toContain('Image is missing')
    await click(runButton(mounted.root))
    await flush()
    expect(createTask).not.toHaveBeenCalled()
    useSavedRuns().remove('r1')
    mounted.app.unmount()
  })

  it('asks again for the secret values of a saved run', async () => {
    useSavedRuns().save({
      id: 'r2', name: 'Upload', savedAt: '2026-10-28T10:00:00Z',
      task: { name: 'Upload', executors: [{ image: 'alpine:3.20', command: ['echo', 'hi'], env: { AWS_SECRET_ACCESS_KEY: 'leaked', THREADS: '4' } }] },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r2')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(content(mounted.root)).toContain('Enter the value of AWS_SECRET_ACCESS_KEY')
    expect(content(mounted.root)).not.toContain('leaked')
    useSavedRuns().remove('r2')
    mounted.app.unmount()
  })

  it('restores a pinned script from its node and version and keeps its exact reference', async () => {
    const arn = 'arn:aruna:realm:node-b:s3/scripts/run/script.py@01K8W1B3D5F7H9KMQ1S3V5X7Z1'
    s3.getObjectText.mockResolvedValueOnce('print("pinned")\n')
    createTask.mockClear()
    useSavedRuns().save({
      id: 'r3', name: 'Pinned', savedAt: '2026-10-28T10:00:00Z',
      task: {
        name: 'Pinned',
        executors: [{ image: 'ghcr.io/astral-sh/uv:python3.13-bookworm-slim', command: ['uv', 'run', '--no-project', '/work/script.py'] }],
        inputs: [{ name: 'script.py', path: '/work/script.py', url: arn, type: 'FILE' }],
      },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r3')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(s3.getObjectText).toHaveBeenCalledWith('scripts', 'run/script.py', 'node-b', '01K8W1B3D5F7H9KMQ1S3V5X7Z1', expect.objectContaining({ nodeId: 'node-b', accessKeyId: 'k-b' }))
    expect(content(mounted.root)).not.toContain('could not be restored')
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    const submitted = (createTask.mock.calls.at(-1) as unknown[])[0] as Tes.TesTask
    expect(submitted.inputs?.find((input) => input.path === '/work/script.py')?.url).toBe(arn)
    useSavedRuns().remove('r3')
    mounted.app.unmount()
  })

  it('sends the run to its result node and pins an input of another node to its version', async () => {
    const version = '01K8W1B3D5F7H9KMQ1S3V5X7Z1'
    searchBuckets.mockImplementation(async (q: string) => ({
      hits: [{ bucket: q, node_id: q === 'refs' ? 'node-c' : 'node-b', group_id: 'group-id' }],
      nodes_failed: 0,
      next_cursor: null,
    }))
    listBucketObjects.mockResolvedValueOnce({ objects: [{ key: 'k12.fna', version_id: version }], next_cursor: null })
    createTask.mockClear()
    useSavedRuns().save({
      id: 'r4', name: 'Split', savedAt: '2026-10-30T10:00:00Z',
      task: {
        name: 'Split',
        executors: [{ image: 'alpine:3.20', command: ['cat', '/work/in/k12.fna'] }],
        inputs: [{ name: 'k12.fna', path: '/work/in/k12.fna', url: 's3://refs/k12.fna', type: 'FILE' }],
        outputs: [{ url: 's3://results/split/', path: '/work/out/', type: 'DIRECTORY' }],
      },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r4')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(listBucketObjects).toHaveBeenCalledWith('refs', expect.objectContaining({ prefix: 'k12.fna' }), 'node-c')
    const [submitted, base] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask, string]
    expect(base).toBe('https://node-b.example.org/api/v1')
    expect(submitted.inputs?.[0]?.url).toBe(ContentIdentity.versionObjectId('realm', 'node-c', 'refs', 'k12.fna', version))
    searchBuckets.mockReset()
    searchBuckets.mockImplementation(async (q: string) => ({ hits: [{ bucket: q || 'results', node_id: 'node-id', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    useSavedRuns().remove('r4')
    mounted.app.unmount()
  })

  it('pins an input of a distributed bucket on the node that holds its range', async () => {
    const version = '01K8W1B3D5F7H9KMQ1S3V5X7Z1'
    searchBuckets.mockImplementation(async (q: string) => ({
      hits: q === 'refs'
        ? [{ bucket: q, node_id: 'node-c', group_id: 'group-id', set_id: 'set-1' }]
        : [{ bucket: q, node_id: 'node-b', group_id: 'group-id' }],
      nodes_failed: 0,
      next_cursor: null,
    }))
    getBucketDistribution.mockResolvedValueOnce({
      members: [{ member_id: 'm-c', node_id: 'node-c', state: 'ready' }, { member_id: 'm-d', node_id: 'node-d', state: 'ready' }],
      ranges: [
        { range_id: 'r1', lower: '', upper: 'j', coordinator: 'm-c', replicas: [] },
        { range_id: 'r2', lower: 'j', coordinator: 'm-d', replicas: [] },
      ],
    })
    listBucketObjects.mockResolvedValueOnce({ objects: [{ key: 'k12.fna', version_id: version }], next_cursor: null })
    createTask.mockClear()
    useSavedRuns().save({
      id: 'r5', name: 'Ranged', savedAt: '2026-10-30T10:00:00Z',
      task: {
        name: 'Ranged',
        executors: [{ image: 'alpine:3.20', command: ['cat', '/work/in/k12.fna'] }],
        inputs: [{ name: 'k12.fna', path: '/work/in/k12.fna', url: 's3://refs/k12.fna', type: 'FILE' }],
        outputs: [{ url: 's3://results/ranged/', path: '/work/out/', type: 'DIRECTORY' }],
      },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r5')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const [submitted] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask, string]
    expect(submitted.inputs?.[0]?.url).toBe(ContentIdentity.versionObjectId('realm', 'node-d', 'refs', 'k12.fna', version))
    searchBuckets.mockReset()
    searchBuckets.mockImplementation(async (q: string) => ({ hits: [{ bucket: q || 'results', node_id: 'node-id', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    useSavedRuns().remove('r5')
    mounted.app.unmount()
  })

  it('pins a plain bucket on its own node though a set elsewhere has the same name', async () => {
    const version = '01K8W1B3D5F7H9KMQ1S3V5X7Z1'
    searchBuckets.mockImplementation(async (q: string) => ({
      hits: q === 'refs'
        ? [{ bucket: q, node_id: 'node-a', group_id: 'other-group' }, { bucket: q, node_id: 'node-c', group_id: 'group-id', set_id: 'set-1' }]
        : [{ bucket: q, node_id: 'node-b', group_id: 'group-id' }],
      nodes_failed: 0,
      next_cursor: null,
    }))
    getBucketDistribution.mockResolvedValueOnce({
      members: [{ member_id: 'm-c', node_id: 'node-c', state: 'ready' }, { member_id: 'm-d', node_id: 'node-d', state: 'ready' }],
      ranges: [{ range_id: 'r1', lower: '', coordinator: 'm-d', replicas: [] }],
    })
    listBucketObjects.mockResolvedValueOnce({ objects: [{ key: 'k12.fna', version_id: version }], next_cursor: null })
    createTask.mockClear()
    useSavedRuns().save({
      id: 'r7', name: 'Same name', savedAt: '2026-10-30T10:00:00Z',
      task: {
        name: 'Same name',
        executors: [{ image: 'alpine:3.20', command: ['cat', '/work/in/k12.fna'] }],
        inputs: [{ name: 'k12.fna', path: '/work/in/k12.fna', url: 's3://refs/k12.fna', type: 'FILE' }],
        outputs: [{ url: 's3://results/same/', path: '/work/out/', type: 'DIRECTORY' }],
      },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r7')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const [submitted] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask, string]
    expect(submitted.inputs?.[0]?.url).toBe(ContentIdentity.versionObjectId('realm', 'node-a', 'refs', 'k12.fna', version))
    searchBuckets.mockReset()
    searchBuckets.mockImplementation(async (q: string) => ({ hits: [{ bucket: q || 'results', node_id: 'node-id', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    useSavedRuns().remove('r7')
    mounted.app.unmount()
  })

  it('expands a folder of another node into its files, without folder markers', async () => {
    const version = '01K8W1B3D5F7H9KMQ1S3V5X7Z1'
    searchBuckets.mockImplementation(async (q: string) => ({
      hits: [{ bucket: q, node_id: q === 'refs' ? 'node-c' : 'node-b', group_id: 'group-id' }],
      nodes_failed: 0,
      next_cursor: null,
    }))
    listBucketObjects.mockResolvedValueOnce({
      objects: [{ key: 'db/', version_id: version }, { key: 'db/sub/', version_id: version }, { key: 'db/sub/a.tsv', version_id: version }],
      next_cursor: null,
    })
    createTask.mockClear()
    useSavedRuns().save({
      id: 'r6', name: 'Markers', savedAt: '2026-10-30T10:00:00Z',
      task: {
        name: 'Markers',
        executors: [{ image: 'alpine:3.20', command: ['ls', '/work/in/db'] }],
        inputs: [{ name: 'db', path: '/work/in/db', url: 's3://refs/db/', type: 'DIRECTORY' }],
        outputs: [{ url: 's3://results/markers/', path: '/work/out/', type: 'DIRECTORY' }],
      },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r6')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const [submitted] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask]
    expect(submitted.inputs?.map((entry) => [entry.name, entry.path, entry.type])).toEqual([['sub/a.tsv', '/work/in/db/sub/a.tsv', 'FILE']])
    searchBuckets.mockReset()
    searchBuckets.mockImplementation(async (q: string) => ({ hits: [{ bucket: q || 'results', node_id: 'node-id', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    useSavedRuns().remove('r6')
    mounted.app.unmount()
  })

  it('refuses to expand a folder of another node listed from a lagging copy', async () => {
    searchBuckets.mockImplementation(async (q: string) => ({
      hits: [{ bucket: q, node_id: q === 'refs' ? 'node-c' : 'node-b', group_id: 'group-id' }],
      nodes_failed: 0,
      next_cursor: null,
    }))
    listBucketObjects.mockResolvedValueOnce({ objects: [{ key: 'db/a.tsv', version_id: '01K8W1B3D5F7H9KMQ1S3V5X7Z1' }], next_cursor: null, stale_ranges: [{}] })
    createTask.mockClear()
    useSavedRuns().save({
      id: 'r5', name: 'Stale', savedAt: '2026-10-30T10:00:00Z',
      task: {
        name: 'Stale',
        executors: [{ image: 'alpine:3.20', command: ['ls', '/work/in/db'] }],
        inputs: [{ name: 'db', path: '/work/in/db', url: 's3://refs/db/', type: 'DIRECTORY' }],
        outputs: [{ url: 's3://results/stale/', path: '/work/out/', type: 'DIRECTORY' }],
      },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r5')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(createTask).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('listed from a copy that may miss recent files')
    searchBuckets.mockReset()
    searchBuckets.mockImplementation(async (q: string) => ({ hits: [{ bucket: q || 'results', node_id: 'node-id', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    useSavedRuns().remove('r5')
    mounted.app.unmount()
  })

  it('prefills the executor from the template in the query', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=python')

    // The runtime prefills the executor and brings the script section with it.
    expect(content(mounted.root)).toContain('Python runtime')
    expect((input(mounted.root, 'placeholder', 'ubuntu:22.04') as unknown as { value: string }).value).toBe('ghcr.io/astral-sh/uv:python3.13-bookworm-slim')
    expect(content(mounted.root)).toContain('script.py')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('prefills a Bakta run from its template', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=bakta')

    expect((input(mounted.root, 'placeholder', 'ubuntu:22.04') as unknown as { value: string }).value).toContain('/aruna/bakta-rs@sha256:2bf286e6')
    expect(content(mounted.root)).toContain('/work/in/db')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('mounts a pick from a path chip where the Inputs card button mounts it', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=bakta')
    const mountDir = () => {
      const dialog = element(mounted.root, (node) => 'mount-default' in node.props || 'mountDefault' in node.props)
      return dialog.props['mount-default'] ?? dialog.props.mountDefault
    }
    const chip = element(
      mounted.root,
      (node) => node.tag === 'button' && content(node).trim() === 'Add input' && content(node.parent!).includes('/work/in/db/'),
    )

    await click(chip)
    const fromChip = mountDir()
    await click(element(mounted.root, (node) => node.props.variant === 'outline' && content(node).trim() === 'Add input'))

    expect(fromChip).toBe(mountDir())
    expect(fromChip).toBe('/work/in/')
    mounted.app.unmount()
  })

  it('mounts a pick from the Table view where the Tree view mounts it', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=bakta')
    const editor = element(mounted.root, (node) => typeof node.props.onAdd === 'function' && 'modelValue' in node.props)

    ;(editor.props.onAdd as () => void)()
    await flush()

    const dialog = element(mounted.root, (node) => 'mount-default' in node.props || 'mountDefault' in node.props)
    expect(dialog.props['mount-default'] ?? dialog.props.mountDefault).toBe('/work/in/')
    expect(dialog.props.open).toBe(true)
    mounted.app.unmount()
  })

  it('captures the Bakta output folder as a folder', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=bakta')
    await click(button(mounted.root, 'Capture'))
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const [submitted] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask]
    expect(submitted.outputs).toEqual([
      { url: 's3://results/quickruns/run/out', path: '/work/out/*', path_prefix: '/work/out', type: 'FILE' },
    ])
    mounted.app.unmount()
  })

  it('names an uploaded script by its version on the node it was uploaded to', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=python')
    await click(button(mounted.root, 'Add output'))
    await typeValue(input(mounted.root, 'aria-label', 'Container path to capture'), '/work/out/result.txt')
    await typeValue(input(mounted.root, 'aria-label', 'Destination key'), 'runs/result.txt')
    await flush()

    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(s3.putTextObject).toHaveBeenCalled()
    const [submitted] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask]
    const script = submitted.inputs?.find((entry) => entry.path.endsWith('script.py'))
    expect(script?.url).toMatch(/^arn:aruna:realm:node-id:s3\/results\/.+script\.py@v1$/)
    mounted.app.unmount()
  })

  it('stages the script in a bucket of another node through that node', async () => {
    searchBuckets.mockImplementation(async (q: string) => ({ hits: [{ bucket: q || 'demo', node_id: 'node-b', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    s3.referenceForNode.mockClear()
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=python')
    await click(button(mounted.root, 'Add output'))
    await typeValue(input(mounted.root, 'aria-label', 'Container path to capture'), '/work/out/result.txt')
    await typeValue(input(mounted.root, 'aria-label', 'Destination key'), 'runs/result.txt')
    await flush()
    expect(content(mounted.root)).not.toContain('The script needs a bucket')

    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const reference = { nodeId: 'node-b', groupId: 'group-id', accessKeyId: 'k-b' }
    expect(s3.referenceForNode).toHaveBeenCalledWith('node-b', 'group-id')
    expect(s3.putTextObject).toHaveBeenCalledWith('demo', expect.stringMatching(/script\.py$/), expect.any(String), expect.any(String), 'node-b', reference)
    const [submitted, base] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask, string]
    expect(submitted.inputs?.find((entry) => entry.path.endsWith('script.py'))?.url).toMatch(/^arn:aruna:realm:node-b:s3\/demo\/.+script\.py@v1$/)
    expect(base).toBe('https://node-b.example.org/api/v1')
    searchBuckets.mockReset()
    searchBuckets.mockImplementation(async (q: string) => ({ hits: [{ bucket: q || 'results', node_id: 'node-id', group_id: 'group-id' }], nodes_failed: 0, next_cursor: null }))
    mounted.app.unmount()
  })

  it('pins the uploaded script by the key it was uploaded under, also after an edit meanwhile', async () => {
    let finish: (value: { versionId: string }) => void = () => {}
    s3.putTextObject.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=python')
    await click(button(mounted.root, 'Add output'))
    await typeValue(input(mounted.root, 'aria-label', 'Container path to capture'), '/work/out/result.txt')
    await typeValue(input(mounted.root, 'aria-label', 'Destination key'), 'runs/result.txt')
    await flush()

    await click(runButton(mounted.root))
    await flush()
    const uploadedKey = (s3.putTextObject.mock.calls.at(-1) as unknown as [string, string])[1]
    await typeValue(input(mounted.root, 'aria-label', 'Script key'), 'edited/other.py')
    finish({ versionId: 'v1' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const [submitted] = createTask.mock.calls.at(-1) as unknown as [Tes.TesTask]
    const script = submitted.inputs?.find((entry) => entry.path.endsWith('script.py'))
    expect(script?.url).toBe(`arn:aruna:realm:node-id:s3/results/${uploadedKey}@v1`)
    mounted.app.unmount()
  })

  it('sends a local run to this device with the local target', async () => {
    runTargetAvailable.value = true
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Edit placement'))
    await typeValue(
      element(mounted.root, (node) => node.tag === 'select' && node.props['aria-label'] === 'Run on'),
      'local',
    )
    await flush()
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(submitJob).toHaveBeenCalledTimes(1)
    const [request, client] = submitJob.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>]
    expect(request.target).toBe('local')
    expect(request.outputs).toEqual([
      { container_path: '/work/out/result.txt', dest_key: 'runs/result.txt', bucket: 'results' },
    ])
    expect(client).toEqual({ baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' })
    expect(mounted.router!.currentRoute.value.name).toBe('run')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('lets a local run take a pinned input without another version check failing', async () => {
    runTargetAvailable.value = true
    runTargetChoice.value = 'local'
    submitJob.mockClear()
    const arn = 'arn:aruna:realm:node-b:s3/db/genome.fna@01K8W1B3D5F7H9KMQ1S3V5X7Z1'
    useSavedRuns().save({
      id: 'r4', name: 'Local', savedAt: '2026-10-28T10:00:00Z',
      task: { name: 'Local', executors: [{ image: 'alpine:3.20', command: ['cat', '/in/genome.fna'] }], inputs: [{ name: 'genome.fna', path: '/in/genome.fna', url: arn, type: 'FILE' }] },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r4')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(content(mounted.root)).not.toContain('need an exact version')
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
    expect(submitJob).toHaveBeenCalledTimes(1)
    const [request] = submitJob.mock.calls[0] as unknown as [{ inputs: Record<string, unknown>[] }]
    expect(request.inputs[0]).toMatchObject({ source_node_id: 'node-b', version_id: '01K8W1B3D5F7H9KMQ1S3V5X7Z1' })
    useSavedRuns().remove('r4')
    mounted.app.unmount()
  })

  it('names a version reference with broken escaping instead of failing to render', async () => {
    createTask.mockClear()
    useSavedRuns().save({
      id: 'r5', name: 'Broken', savedAt: '2026-10-28T10:00:00Z',
      task: { name: 'Broken', executors: [{ image: 'alpine:3.20', command: ['cat', '/in/a'] }], inputs: [{ name: 'a', path: '/in/a', url: 'arn:aruna:realm:node-b:s3/db/%ZZ@01K8W1B3D5F7H9KMQ1S3V5X7Z1', type: 'FILE' }] },
      ask: { inputs: [], results: false },
    })
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?saved=r5')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(content(mounted.root)).toContain('The input /in/a names a version that cannot be read')
    await click(runButton(mounted.root))
    await flush()
    expect(createTask).not.toHaveBeenCalled()
    expect(mounted.errors).toEqual([])
    useSavedRuns().remove('r5')
    mounted.app.unmount()
  })

  it('carries a placement constraint into the task tags', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Edit placement'))
    await typeValue(input(mounted.root, 'aria-label', 'Node'), 'node-id')
    await click(button(mounted.root, 'Add constraint'))
    await flush()
    await click(runButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const submitted = (createTask.mock.calls[0] as unknown[])[0] as Tes.TesTask
    expect(submitted.tags).toMatchObject({
      'aruna-engine.org/group': 'group-id',
      'aruna-engine.org/label/aruna-engine.org/node': 'node-id',
      'aruna-engine.org/label/region': 'eu-central',
    })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('offers no scratch storage choice at all', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')
    await fillValidRun(mounted.root)

    const page = content(mounted.root)
    expect(page).not.toContain('Workspace')
    expect(page).not.toContain('Scratch')
    expect(nodes(mounted.root).some((node) => node.props['data-tutorial'] === 'run-workspace')).toBe(false)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('renders Admin Onboarding snippets after typing a numeric weight', async () => {
    const mounted = await mount(AdminOnboardingView, '/app/admin')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).includes('node for my realm')))
    await click(button(mounted.root, 'Continue'))
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).includes('Management')))
    await click(button(mounted.root, 'Continue'))
    await click(button(mounted.root, 'Mint secret'))
    await click(button(mounted.root, 'Continue to configuration'))

    await typeValue(input(mounted.root, 'placeholder', '1'), '7.5')

    expect(content(mounted.root)).toContain('ARUNA_NODE_WEIGHT=7.5')
    expect(content(mounted.root)).toContain('ARUNA_NODE_WEIGHT: "7.5"')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
