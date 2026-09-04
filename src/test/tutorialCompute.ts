// Mounts the compute tutorial the way the app shell does: the real wizard, the
// real run detail and the real router, with only the leaf presentation stubbed.
// Two suites drive it, so the wiring lives here rather than in either of them.
import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as RouterRuntime from 'vue-router'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { vi } from 'vitest'
import { compileClientComponent, flush, moduleDefault, mountApp, refreshButton, type Mounted } from '@/test/clientRender'
import * as Poll from '@/lib/poll'
import * as CustomRun from '@/composables/useCustomRun'
import * as JobsComposable from '@/composables/useJobs'
import * as ObjectPreview from '@/composables/useObjectPreview'
import * as RefreshComposable from '@/composables/useRefresh'
import * as S3 from '@/composables/useS3'
import * as Tes from '@/composables/useTes'
import * as ChunkRecovery from '@/lib/chunk-recovery'
import * as NativeSubmit from '@/lib/nativeSubmit'
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as QuickRuntimes from '@/lib/quickRuntimes'
import * as RunTargetLib from '@/lib/runTarget'
import * as Shellwords from '@/lib/shellwords'
import * as TesLib from '@/lib/tes'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'
import * as JobsLib from '@/lib/jobs'
import * as VueUse from '@vueuse/core'
import * as TutorialFixtures from '@/lib/tutorial/fixtures/data'
import * as TutorialRun from '@/lib/tutorial/fixtures/run'
import * as TutorialApi from '@/lib/tutorial/services/tutorialApi'
import * as TutorialJobClient from '@/lib/tutorial/services/tutorialJobClient'
import * as TutorialS3 from '@/lib/tutorial/services/tutorialS3'
import * as TutorialSteps from '@/lib/tutorial/steps/compute'
import * as TutorialSession from '@/lib/tutorial/session'
import { bindTutorialRouter, exitTutorial } from '@/lib/tutorial/session'

const GenericStub = defineComponent(() => () => h('div'))
const PassThroughStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('select', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value)),
    }),
})
const SwitchStub = defineComponent((_, { attrs }) => () => h('input', { ...attrs, type: 'checkbox' }))
const TextareaStub = defineComponent((_, { attrs }) => () => h('textarea', attrs))
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const NoticeStub = defineComponent({
  props: { tone: String, title: String },
  setup: (props, { attrs, slots }) => () =>
    h('div', { ...attrs, role: props.tone === 'error' ? 'alert' : 'status' }, [props.title, slots.default?.()]),
})
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()]),
})
const WizardStepsStub = defineComponent({
  props: { steps: { type: Array, default: () => [] }, current: Number },
  setup: (props) => () => h('nav', (props.steps as string[]).map((step) => h('span', step))),
})
const TaskJsonPreviewStub = defineComponent({
  props: { title: String, task: { type: Object, required: true } },
  setup: (props) => () => h('section', [h('h2', props.title), h('pre', JSON.stringify(props.task, null, 2))]),
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
// Renders the stage labels the panel projects from the run state.
const StagesStub = defineComponent({
  props: { stages: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h(
      'ul',
      (props.stages as Array<{ label: string; state: string }>).map((stage) => h('li', `${stage.label}:${stage.state}`)),
    ),
})
const TaskHeaderStub = defineComponent({
  props: { title: String, runId: String, state: String, description: String },
  setup: (props) => () => h('header', [h('h2', props.title), h('span', props.state), h('p', props.description)]),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const DetailDialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () =>
    props.open ? h('div', [slots.header?.(), slots.default?.(), slots.footer?.()]) : null,
})
const PreviewStub = defineComponent({
  props: { bucket: String, objectKey: String, name: String },
  setup: (props) => () => h('section', `preview ${props.bucket}/${props.objectKey}`),
})
const RouterLinkStub = defineComponent((_, { attrs, slots }) => () => h('a', attrs, slots.default?.()))
const icons = new Proxy({}, { get: () => GenericStub })

const currentUser = ref<{ id: string; name: string } | null>({ id: 'user-id', name: 'Ada Lovelace' })
const arunaModule = {
  useAruna: () => ({
    apiBaseUrl: ref('/api/v1'),
    authToken: ref('tutorial-token'),
    currentUser,
    myGroups: ref([]),
    metadataAtPath: async () => null,
    realm: ref({ id: 'realm-id', name: 'Test realm', shortName: 'Test realm' }),
    userInfo: ref(null),
    updateUserProfile: vi.fn(async () => undefined),
  }),
}
const authModule = { useAuth: () => ({ stage: ref('authenticated'), authPending: ref(false), signIn: vi.fn() }) }
const onboardingModule = {
  useOnboarding: () => ({
    isNewUser: computed(() => false),
    hasDone: () => false,
    markTutorialDone: vi.fn(async () => undefined),
    dismissOnboarding: vi.fn(async () => undefined),
  }),
}
const runTargetModule = {
  useRunTarget: () => ({
    target: ref('realm'),
    available: computed(() => false),
    local: computed(() => false),
    localClient: computed(() => null),
    compute: ref(null),
  }),
}

const url = (path: string) => new URL(`../${path}`, import.meta.url)

const Input = compileClientComponent(url('components/ui/Input.vue'), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
  '@vueuse/core': VueUse,
})

const ui = {
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Textarea.vue': moduleDefault(TextareaStub),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Skeleton.vue': moduleDefault(GenericStub),
  '@/components/ui/EmptyState.vue': moduleDefault(GenericStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(GenericStub),
  '@/components/ui/FilterChips.vue': moduleDefault(FilterChipsStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
  '@/components/ui/Tooltip.vue': moduleDefault(PassThroughStub),
  '@/components/ui/ExternalLink.vue': moduleDefault(GenericStub),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/onboarding/WizardSteps.vue': moduleDefault(WizardStepsStub),
}

const ExecutorStepsEditor = compileClientComponent(url('components/compute/ExecutorStepsEditor.vue'), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  ...ui,
  '@/lib/shellwords': Shellwords,
})
const stepModules = {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...ui,
  '@/composables/useCustomRun': CustomRun,
  '@/lib/tes': TesLib,
  '@/lib/jobs': JobsLib,
  '@/lib/utils': Utils,
  '@/components/compute/ExecutorStepsEditor.vue': moduleDefault(ExecutorStepsEditor),
  '@/components/compute/ContainerFsTree.vue': moduleDefault(GenericStub),
  '@/components/compute/TesInputsEditor.vue': moduleDefault(GenericStub),
  '@/components/compute/TaskJsonPreview.vue': moduleDefault(TaskJsonPreviewStub),
  '@/components/compute/RunPlacementSection.vue': moduleDefault(GenericStub),
}
const ContainerFilesystem = compileClientComponent(url('components/compute/custom/ContainerFilesystem.vue'), stepModules)
const AdvancedPlacement = compileClientComponent(url('components/compute/custom/AdvancedPlacement.vue'), stepModules)
const BasicsStep = compileClientComponent(url('components/compute/custom/BasicsStep.vue'), {
  ...stepModules,
  '@/components/groups/GroupSelect.vue': moduleDefault(SelectStub),
})
const WorkloadStep = compileClientComponent(url('components/compute/custom/WorkloadStep.vue'), {
  ...stepModules,
  '@/components/compute/custom/ContainerFilesystem.vue': moduleDefault(ContainerFilesystem),
  '@/components/compute/custom/AdvancedPlacement.vue': moduleDefault(AdvancedPlacement),
})
const ReviewStep = compileClientComponent(url('components/compute/custom/ReviewStep.vue'), stepModules)
const WizardNavBar = compileClientComponent(url('components/compute/WizardNavBar.vue'), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  ...ui,
})
const ComputeGates = compileClientComponent(url('components/compute/ComputeGates.vue'), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  ...ui,
  '@/composables/useAruna': arunaModule,
  '@/composables/useAuth': authModule,
})
const RerunPrefillNote = compileClientComponent(url('components/compute/RerunPrefillNote.vue'), {
  vue: VueRuntime,
  ...ui,
})
const TesDataRefDialog = compileClientComponent(url('components/compute/TesDataRefDialog.vue'), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': icons,
  ...ui,
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogClose.vue': moduleDefault(PassThroughStub),
  '@/components/ui/DialogContent.vue': moduleDefault(PassThroughStub),
  '@/components/ui/DialogDescription.vue': moduleDefault(PassThroughStub),
  '@/components/ui/DialogFooter.vue': moduleDefault(PassThroughStub),
  '@/components/ui/DialogHeader.vue': moduleDefault(PassThroughStub),
  '@/components/ui/DialogTitle.vue': moduleDefault(PassThroughStub),
  '@/components/data/ObjectBrowserPanel.vue': moduleDefault(GenericStub),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(GenericStub),
  '@/composables/useS3': S3,
  '@/composables/useAruna': arunaModule,
  '@/composables/useGroupSelection': { activeGroupId: ref('') },
  '@/lib/tes': TesLib,
  '@/lib/utils': Utils,
})
const ComputeSubmitView = compileClientComponent(url('views/ComputeSubmitView.vue'), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...ui,
  '@/components/compute/custom/BasicsStep.vue': moduleDefault(BasicsStep),
  '@/components/compute/custom/WorkloadStep.vue': moduleDefault(WorkloadStep),
  '@/components/compute/custom/ReviewStep.vue': moduleDefault(ReviewStep),
  '@/components/compute/TesDataRefDialog.vue': moduleDefault(TesDataRefDialog),
  '@/components/compute/ComputeGates.vue': moduleDefault(ComputeGates),
  '@/components/compute/RerunPrefillNote.vue': moduleDefault(RerunPrefillNote),
  '@/components/compute/WizardNavBar.vue': moduleDefault(WizardNavBar),
  '@/composables/useCustomRun': CustomRun,
  '@/composables/useTes': Tes,
  '@/composables/useAruna': arunaModule,
  '@/composables/useComputeDataView': { useComputeDataView: () => ref('tree') },
  '@/composables/useS3': S3,
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ executorKinds: ref(['docker']) }) },
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ shortName: 'Test realm' }) }) },
  '@/composables/useRunTarget': runTargetModule,
  '@/lib/tes': TesLib,
  '@/lib/utils': Utils,
  '@/lib/workspaces': Workspaces,
  '@/lib/nativeSubmit': NativeSubmit,
  '@/lib/runTarget': RunTargetLib,
  '@/lib/jobs': JobsLib,
  '@/lib/placementPolicies': PlacementPolicies,
})
const TaskDetailPanel = compileClientComponent(url('components/compute/TaskDetailPanel.vue'), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...ui,
  '@/components/ui/DetailDialog.vue': moduleDefault(DetailDialogStub),
  '@/components/ui/DialogTitle.vue': moduleDefault(PassThroughStub),
  '@/components/ui/DetailList.vue': moduleDefault(
    compileClientComponent(url('components/ui/DetailList.vue'), { vue: VueRuntime }),
  ),
  '@/components/ui/CountedList.vue': moduleDefault(
    compileClientComponent(url('components/ui/CountedList.vue'), {
      vue: VueRuntime,
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    }),
  ),
  '@/components/ui/DocsLink.vue': moduleDefault(GenericStub),
  '@/components/ui/Pagination.vue': moduleDefault(GenericStub),
  '@/components/jobs/JobPlacementFigure.vue': moduleDefault(GenericStub),
  '@/components/jobs/JobExecutionsTable.vue': moduleDefault(GenericStub),
  '@/components/compute/RunLogDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/TaskHeader.vue': moduleDefault(TaskHeaderStub),
  '@/components/assistant/AskAiButton.vue': moduleDefault(GenericStub),
  '@/components/onboarding/ClaimWatchStep.vue': moduleDefault(StagesStub),
  '@/components/preview/PreviewBody.vue': moduleDefault(PreviewStub),
  '@/composables/useTes': Tes,
  '@/composables/useJobs': JobsComposable,
  '@/composables/useAruna': arunaModule,
  '@/composables/useHiddenTasks': { useHiddenTasks: () => ({ hide: vi.fn() }) },
  '@/composables/useS3': S3,
  '@/composables/useObjectPreview': ObjectPreview,
  '@/composables/useRefresh': RefreshComposable,
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
  '@/components/ui/NodeLabel.vue': moduleDefault(GenericStub),
  '@/lib/chunk-recovery': ChunkRecovery,
  '@/lib/poll': Poll,
  '@/lib/quickRuntimes': QuickRuntimes,
  '@/lib/jobs': JobsLib,
  '@/lib/tes': TesLib,
  '@/lib/utils': Utils,
})
const TutorialComputeView = compileClientComponent(url('views/TutorialComputeView.vue'), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  ...ui,
  '@/views/ComputeSubmitView.vue': moduleDefault(ComputeSubmitView),
  '@/components/compute/TaskDetailPanel.vue': moduleDefault(TaskDetailPanel),
  '@/composables/useAruna': arunaModule,
  '@/composables/useCustomRun': CustomRun,
  '@/composables/useJobs': JobsComposable,
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ id: 'realm-id', shortName: 'Test realm' }) }) },
  '@/composables/useRunTarget': runTargetModule,
  '@/composables/useS3': S3,
  '@/composables/useTes': Tes,
  '@/composables/useOnboarding': onboardingModule,
  '@/lib/tutorial/fixtures/data': TutorialFixtures,
  '@/lib/tutorial/fixtures/run': TutorialRun,
  '@/lib/tutorial/services/tutorialApi': TutorialApi,
  '@/lib/tutorial/services/tutorialJobClient': TutorialJobClient,
  '@/lib/tutorial/services/tutorialS3': TutorialS3,
  '@/lib/tutorial/steps/compute': TutorialSteps,
  '@/lib/tutorial/session': TutorialSession,
})

const RouteStub = defineComponent(() => () => h('div', 'route'))
const Harness = defineComponent(() => () => h(RouterView))

export interface TutorialMount extends Mounted {
  router: Router
  fetchSpy: ReturnType<typeof vi.fn>
}

// A router navigation resolves after about thirty chained microtasks, so a
// couple of render flushes are not enough to see the route it lands on.
export async function settle() {
  for (let turn = 0; turn < 60; turn++) await Promise.resolve()
  await flush()
}

/** Mounts the tutorial route through a real router, with time under control. */
export async function mountTutorialCompute(path = '/app/tutorial/compute'): Promise<TutorialMount> {
  exitTutorial()
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('document', { hidden: false, querySelectorAll: () => [] })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/tutorial/compute', name: 'tutorial-compute', component: TutorialComputeView as Component },
      { path: '/app/compute', name: 'compute', component: RouteStub },
      { path: '/app/compute/new', name: 'compute-new', component: RouteStub },
      { path: '/app/compute/quick', name: 'compute-quick', component: RouteStub },
      { path: '/app/compute/:taskId', name: 'task', component: RouteStub },
      { path: '/app/jobs/:jobId', name: 'job', component: RouteStub },
      { path: '/app/runs/:jobId', name: 'run', component: RouteStub },
      { path: '/app/buckets/:bucketId', name: 'bucket', component: RouteStub },
      { path: '/app/datasets/:id', name: 'dataset', component: RouteStub },
      { path: '/app/buckets', name: 'buckets', component: RouteStub },
    ],
  })
  bindTutorialRouter(router)
  await router.push(path)
  await router.isReady()
  const mounted = await mountApp(Harness, { router })
  await flush()
  return { ...mounted, router, fetchSpy }
}
