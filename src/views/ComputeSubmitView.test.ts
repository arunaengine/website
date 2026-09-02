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
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as RunTarget from '@/lib/runTarget'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'

vi.stubGlobal('Document', class {})
vi.stubGlobal('ShadowRoot', class {})

const GenericStub = defineComponent(() => () => h('div'))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('select', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value)),
    })
  },
})
const SwitchStub = defineComponent((_, { attrs }) => () => h('input', { ...attrs, type: 'checkbox' }))
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()])
  },
})
const WizardStepsStub = defineComponent({
  props: { steps: { type: Array, default: () => [] } },
  setup(props) {
    return () => h('nav', props.steps.map((step) => h('span', String(step))))
  },
})
const ExecutorStub = defineComponent({
  props: { modelValue: { type: Array, required: true } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const initial = props.modelValue[0] as { image?: string; command?: string[] } | undefined
    const image = ref(initial?.image ?? '')
    const commandLine = ref(initial?.command?.join(' ') ?? '')
    const update = () =>
      emit('update:modelValue', [
        { image: image.value, command: commandLine.value.trim() ? commandLine.value.trim().split(/\s+/) : [] },
      ])
    return () =>
      h('div', [
        h('input', {
          placeholder: 'ubuntu:22.04',
          value: image.value,
          onInput: (event: { target: { value: unknown } }) => {
            image.value = String(event.target.value)
            update()
          },
        }),
        h('input', {
          'aria-label': 'Command line',
          value: commandLine.value,
          onInput: (event: { target: { value: unknown } }) => {
            commandLine.value = String(event.target.value)
            update()
          },
        }),
      ])
  },
})
const TaskJsonPreviewStub = defineComponent({
  props: { title: { type: String, required: true }, task: { type: Object, required: true } },
  setup(props) {
    return () => h('section', [h('h2', props.title), h('pre', JSON.stringify(props.task, null, 2))])
  },
})
const PlacementPickerStub = defineComponent({
  props: { modelValue: { type: Object, required: true } },
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () => h('button', {
      onClick: () => emit('update:modelValue', {
        'aruna-engine.org/node': 'node-a',
        region: 'eu-central',
      }),
    }, 'Set test placement')
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
    watch: ref({
      phase: 'idle',
      enrollmentId: null,
      claimedBy: null,
      claimedIsNode: false,
      lastError: null,
    }),
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
const RunTargetPicker = compileClientComponent(
  new URL('../components/compute/RunTargetPicker.vue', import.meta.url),
  { vue: VueRuntime, '@lucide/vue': icons },
)
const useAuthModule = {
  useAuth: () => ({ stage: ref('authenticated'), authPending: ref(false), signIn: vi.fn() }),
}
const WizardNavBar = compileClientComponent(
  new URL('../components/compute/WizardNavBar.vue', import.meta.url),
  { vue: VueRuntime, '@lucide/vue': icons, '@/components/ui/Button.vue': moduleDefault(ButtonStub) },
)
const RerunPrefillNote = compileClientComponent(
  new URL('../components/compute/RerunPrefillNote.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  },
)
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
const RunPlacementSection = compileClientComponent(
  new URL('../components/compute/RunPlacementSection.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
    '@/components/compute/RunTargetPicker.vue': moduleDefault(RunTargetPicker),
    '@/components/compute/PlacementPicker.vue': moduleDefault(PlacementPickerStub),
  },
)

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
const sharedComponents = {
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(SelectStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/FilterChips.vue': moduleDefault(FilterChipsStub),
  '@/components/ui/Skeleton.vue': moduleDefault(GenericStub),
  '@/components/onboarding/WizardSteps.vue': moduleDefault(WizardStepsStub),
}
// The wizard steps are separate components; each is compiled against the same
// stubs and handed to the view as its import.
const stepModules = {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedComponents,
  '@/components/ui/Textarea.vue': moduleDefault(GenericStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/compute/TaskJsonPreview.vue': moduleDefault(TaskJsonPreviewStub),
  '@/components/compute/ExecutorStepsEditor.vue': moduleDefault(ExecutorStub),
  '@/components/compute/TesInputsEditor.vue': moduleDefault(GenericStub),
  '@/components/compute/ContainerFsTree.vue': moduleDefault(GenericStub),
  '@/components/compute/RunPlacementSection.vue': moduleDefault(RunPlacementSection),
  '@/composables/useCustomRun': CustomRun,
  '@/lib/tes': Tes,
  '@/lib/jobs': { ...Jobs, submitJob },
}
const stepComponent = (path: string) =>
  moduleDefault(compileClientComponent(new URL(path, import.meta.url), stepModules))
const BasicsStep = stepComponent('../components/compute/custom/BasicsStep.vue')
const ReviewStep = stepComponent('../components/compute/custom/ReviewStep.vue')
const WorkloadStep = moduleDefault(
  compileClientComponent(new URL('../components/compute/custom/WorkloadStep.vue', import.meta.url), {
    ...stepModules,
    '@/components/compute/custom/ContainerFilesystem.vue': stepComponent(
      '../components/compute/custom/ContainerFilesystem.vue',
    ),
    '@/components/compute/custom/AdvancedPlacement.vue': stepComponent(
      '../components/compute/custom/AdvancedPlacement.vue',
    ),
  }),
)
const ComputeSubmitView = compileClientComponent(new URL('./ComputeSubmitView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedComponents,
  '@/components/compute/custom/BasicsStep.vue': BasicsStep,
  '@/components/compute/custom/WorkloadStep.vue': WorkloadStep,
  '@/components/compute/custom/ReviewStep.vue': ReviewStep,
  '@/components/compute/TesDataRefDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/ComputeGates.vue': moduleDefault(ComputeGates),
  '@/composables/useCustomRun': CustomRun,
  '@/components/compute/RerunPrefillNote.vue': moduleDefault(RerunPrefillNote),
  '@/components/compute/RunPlacementSection.vue': moduleDefault(RunPlacementSection),
  '@/components/compute/WizardNavBar.vue': moduleDefault(WizardNavBar),
  '@/composables/useTes': {
    isTesUnsupported: () => false,
    useTes: () => ({
      tesEnabled: ref(true),
      busy: ref(false),
      createTask,
      getTask: vi.fn(),
    }),
  },
  '@/composables/useAruna': useArunaModule,
  '@/composables/useComputeDataView': { useComputeDataView: () => ref('table') },
  '@/composables/useS3': {
    useS3: () => ({ hasActiveKey: ref(false), endpoint: ref(null), listBuckets: vi.fn(async () => []) }),
  },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ executorKinds: ref(['docker']) }),
  },
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ shortName: 'Realm' }) }) },
  '@/composables/useRunTarget': { useRunTarget: () => runTarget },
  '@/components/compute/RunTargetPicker.vue': moduleDefault(RunTargetPicker),
  '@/lib/tes': Tes,
  '@/lib/utils': Utils,
  '@/lib/workspaces': Workspaces,
  // Real modules: the TES-versus-native switch is the behaviour under test.
  '@/lib/nativeSubmit': NativeSubmit,
  '@/lib/runTarget': RunTarget,
  '@/lib/jobs': { ...Jobs, submitJob },
  '@/lib/placementPolicies': PlacementPolicies,
})
const AdminOnboardingView = compileClientComponent(new URL('./AdminOnboardingView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedComponents,
  '@/components/ui/ErrorPanel.vue': moduleDefault(GenericStub),
  '@/components/onboarding/KindSelectStep.vue': moduleDefault(KindSelectStub),
  '@/components/onboarding/SecretPanel.vue': moduleDefault(SecretPanelStub),
  '@/components/onboarding/CodeSnippet.vue': moduleDefault(CodeSnippetStub),
  '@/components/onboarding/ClaimWatchStep.vue': moduleDefault(GenericStub),
  '@/components/onboarding/DeviceLane.vue': moduleDefault(GenericStub),
  '@/components/onboarding/SecretsTable.vue': moduleDefault(GenericStub),
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

// One submit verb for both submission surfaces; these tests are about validity
// gating, not about which surface was picked.
function submitButton(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'button' && content(node).trim() === 'Run')
}

// The wizard reads its step from the route, so every case mounts with one.
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

async function fillValidWorkload(root: HostNode) {
  await typeValue(input(root, 'placeholder', 'ubuntu:22.04'), 'alpine:3.20')
  await typeValue(input(root, 'aria-label', 'Command line'), 'echo hello')
  await typeValue(input(root, 'aria-label', 'Container path to capture'), '/outputs/result.txt')
  await typeValue(input(root, 'aria-label', 'Destination bucket'), 'results')
  await typeValue(input(root, 'aria-label', 'Destination key'), 'runs/result.txt')
  await typeValue(input(root, 'placeholder', '1'), '4')
  await typeValue(input(root, 'placeholder', '2'), '8.5')
  await typeValue(input(root, 'placeholder', '10'), '20.25')
}

describe('numeric Input consumers', () => {
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

  it('renders Review with typed CPU, RAM, and Disk numbers without an exception', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await fillValidWorkload(mounted.root)

    expect(button(mounted.root, 'Continue').props.disabled).toBe(true)
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()
    expect(submitButton(mounted.root).props.disabled).toBe(true)

    await mounted.router!.push('/app/compute/new')
    await flush()
    await typeValue(element(mounted.root, (node) => node.tag === 'select'), 'group-id')
    await mounted.router!.push('/app/compute/new?step=1')
    await flush()

    expect(button(mounted.root, 'Continue').props.disabled).toBe(false)
    await click(button(mounted.root, 'Continue'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(content(mounted.root)).toContain('Run request')
    expect(content(mounted.root)).toContain('"cpu_cores": 4')
    expect(content(mounted.root)).toContain('"ram_gb": 8.5')
    expect(content(mounted.root)).toContain('"disk_gb": 20.25')
    expect(nodes(mounted.root).some((node) => node.props['aria-label'] === 'Command line')).toBe(false)
    expect(submitButton(mounted.root).props.disabled).toBe(false)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('keeps invalid resource values blocked after direct Review navigation', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await fillValidWorkload(mounted.root)
    await typeValue(input(mounted.root, 'placeholder', '1'), '4294967296')
    await typeValue(input(mounted.root, 'placeholder', '2'), '0.0000000001')
    await typeValue(input(mounted.root, 'placeholder', '10'), '9223372036.854776')

    expect(button(mounted.root, 'Continue').props.disabled).toBe(true)
    expect(content(mounted.root)).toContain('Enter a whole number of at least 1.')
    expect(content(mounted.root)).toContain('Must be greater than zero.')

    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(submitButton(mounted.root).props.disabled).toBe(true)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('rechecks executor and output validity on a directly reached Review step', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await typeValue(input(mounted.root, 'placeholder', '1'), '1')
    await typeValue(input(mounted.root, 'placeholder', '2'), '1')
    await typeValue(input(mounted.root, 'placeholder', '10'), '1')
    await typeValue(input(mounted.root, 'placeholder', 'ubuntu:22.04'), 'alpine:3.20')
    await typeValue(input(mounted.root, 'aria-label', 'Command line'), 'echo hello')

    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(submitButton(mounted.root).props.disabled).toBe(true)

    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await typeValue(input(mounted.root, 'aria-label', 'Destination bucket'), 'results')
    await typeValue(input(mounted.root, 'aria-label', 'Destination key'), 'runs/result.txt')
    await typeValue(input(mounted.root, 'aria-label', 'Command line'), '')
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(submitButton(mounted.root).props.disabled).toBe(true)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('picks the native jobs API only for options TES cannot carry', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await fillValidWorkload(mounted.root)
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(content(mounted.root)).toContain('POST /ga4gh/tes/v1/tasks')
    expect(content(mounted.root)).not.toContain("Aruna's native jobs API")

    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await click(button(mounted.root, 'Add prefix'))
    await typeValue(input(mounted.root, 'aria-label', 'Output prefix'), 'reports/')
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(content(mounted.root)).toContain('POST /jobs/')
    expect(content(mounted.root)).toContain("Aruna's native jobs API")
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('offers no scratch storage choice at all', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await fillValidWorkload(mounted.root)

    const workload = content(mounted.root)
    expect(workload).not.toContain('Workspace')
    expect(workload).not.toContain('Scratch')
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

describe('run target', () => {
  beforeEach(() => {
    runTargetAvailable.value = false
    runTargetChoice.value = 'realm'
    submitJob.mockClear()
    createTask.mockClear()
  })

  it('offers no choice outside the desktop shell', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')

    expect(content(mounted.root)).not.toContain('Run on')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('sends a local run to this device with the local target', async () => {
    runTargetAvailable.value = true
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')

    expect(content(mounted.root)).not.toContain('Run on')
    await typeValue(element(mounted.root, (node) => node.tag === 'select'), 'group-id')
    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await fillValidWorkload(mounted.root)
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()
    expect(content(mounted.root)).toContain('Run on')
    await click(button(mounted.root, 'This computer'))
    expect(content(mounted.root)).toContain('copied to this computer')
    expect(content(mounted.root)).not.toContain('Set test placement')
    await click(submitButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(submitJob).toHaveBeenCalledTimes(1)
    const [request, client] = submitJob.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>]
    expect(request.target).toBe('local')
    expect(request.tags).toEqual({})
    expect(client).toEqual({ baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' })
    expect(mounted.router!.currentRoute.value.name).toBe('run')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('uses the native request even with no native-only option chosen', async () => {
    // A run on this computer is never the TES facade, whatever the draft asks for.
    runTargetAvailable.value = true
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')

    expect(content(mounted.root)).not.toContain('Run on')
    await typeValue(element(mounted.root, (node) => node.tag === 'select'), 'group-id')
    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    // Everything a realm run needs, and nothing that forces the native surface.
    await typeValue(input(mounted.root, 'placeholder', 'ubuntu:22.04'), 'alpine:3.20')
    await typeValue(input(mounted.root, 'aria-label', 'Command line'), 'echo hello')
    await typeValue(input(mounted.root, 'aria-label', 'Container path to capture'), '/outputs/result.txt')
    await typeValue(input(mounted.root, 'aria-label', 'Destination bucket'), 'results')
    await typeValue(input(mounted.root, 'aria-label', 'Destination key'), 'runs/result.txt')
    await typeValue(input(mounted.root, 'placeholder', '1'), '1')
    await typeValue(input(mounted.root, 'placeholder', '2'), '1')
    await typeValue(input(mounted.root, 'placeholder', '10'), '1')
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    await click(button(mounted.root, 'This computer'))
    expect(content(mounted.root)).toContain('POST /jobs/')
    await click(submitButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(createTask).not.toHaveBeenCalled()
    expect(submitJob).toHaveBeenCalledTimes(1)
    expect((submitJob.mock.calls[0] as unknown[])[0]).toMatchObject({ target: 'local' })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('leaves a realm run on the task API', async () => {
    runTargetAvailable.value = true
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')

    expect(content(mounted.root)).not.toContain('Run on')
    await typeValue(element(mounted.root, (node) => node.tag === 'select'), 'group-id')
    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await fillValidWorkload(mounted.root)
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()
    expect(content(mounted.root)).toContain('Run on')
    await click(submitButton(mounted.root))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(submitJob).not.toHaveBeenCalled()
    expect(createTask).toHaveBeenCalledTimes(1)
    expect(mounted.router!.currentRoute.value.name).toBe('task')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('submits a task that names no workspace', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')

    await typeValue(element(mounted.root, (node) => node.tag === 'select'), 'group-id')
    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await fillValidWorkload(mounted.root)
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(content(mounted.root)).not.toContain('workspace')
    await click(submitButton(mounted.root))
    await flush()

    const submitted = (createTask.mock.calls[0] as unknown[])[0] as Tes.TesTask
    expect(submitted).not.toHaveProperty('workspace')
    expect(submitted.outputs).toEqual([{ url: 's3://results/runs/result.txt', path: '/outputs/result.txt', type: 'FILE' }])
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})

describe('placement labels', () => {
  beforeEach(() => {
    runTargetAvailable.value = false
    runTargetChoice.value = 'realm'
    submitJob.mockClear()
    createTask.mockClear()
  })

  it('adds picker constraints to the TES task tags', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new')

    expect(content(mounted.root)).not.toContain('Set test placement')
    await typeValue(element(mounted.root, (node) => node.tag === 'select'), 'group-id')
    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await fillValidWorkload(mounted.root)
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()
    await click(button(mounted.root, 'Set test placement'))
    await click(submitButton(mounted.root))
    await flush()

    expect(createTask).toHaveBeenCalledTimes(1)
    const submitted = (createTask.mock.calls[0] as unknown[])[0] as Tes.TesTask
    expect(submitted.tags).toMatchObject({
      'aruna-engine.org/group': 'group-id',
      'aruna-engine.org/label/aruna-engine.org/node': 'node-a',
      'aruna-engine.org/label/region': 'eu-central',
    })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
