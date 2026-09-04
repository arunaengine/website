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

const useArunaModule = {
  useAruna: () => ({
    apiBaseUrl: ref('https://node.example.org/api/v1'),
    authToken: ref('realm-token'),
    bootstrapped: ref(true),
    currentUser: ref({ id: 'user-id', display_name: 'Test User' }),
    myGroups: ref([{ id: 'group-id', name: 'Test Group' }]),
    canManageOnboarding: ref(true),
    isManagementNode: ref(true),
    nodeInfo: ref({
      node: { peer_id: 'node-id', capabilities: 'management' },
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
  putTextObject: vi.fn(async () => ({ versionId: 'v1' })),
  createBucket: vi.fn(async () => undefined),
  canWrite: () => true,
  nodeIdFor: () => 'node-id',
}

const sharedUi = {
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
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
  '@/components/compute/TesDataRefDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/RerunPrefillNote.vue': moduleDefault(GenericStub),
  '@/components/compute/ComputeGates.vue': moduleDefault(ComputeGates),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(DialogStub),
  '@/components/assistant/AskAiButton.vue': moduleDefault(GenericStub),
  '@/composables/useCustomRun': CustomRun,
  '@/composables/useTes': {
    isTesUnsupported: () => false,
    useTes: () => ({ tesEnabled: ref(true), busy: ref(false), createTask, getTask: vi.fn() }),
  },
  '@/composables/useAruna': useArunaModule,
  '@/composables/useComputeDataView': { useComputeDataView: () => ref('table') },
  '@/composables/useS3': { useS3: () => s3, s3ErrorMessage: (error: unknown) => String(error) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ nodes: realmNodes }) },
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ shortName: 'Realm' }) }) },
  '@/composables/useRunTarget': { useRunTarget: () => runTarget },
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
    expect(content(mounted.root)).toContain('Capture at least one output')
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

  it('prefills the executor from the template in the query', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?template=python')

    // The runtime prefills the executor and brings the script section with it.
    expect(content(mounted.root)).toContain('Python runtime')
    expect(content(mounted.root)).toContain('ghcr.io/astral-sh/uv:python3.13-bookworm-slim')
    expect(content(mounted.root)).toContain('script.py')
    expect(mounted.errors).toEqual([])
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
