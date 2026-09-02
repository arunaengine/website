// Mounts the profile tutorial the way the app shell does: the real profile
// builder, the real dataset editor and the real router, with only the leaf
// presentation stubbed. Three suites drive it, so the wiring lives here.
import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as RouterRuntime from 'vue-router'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { vi } from 'vitest'
import {
  compileClientComponent,
  flush,
  moduleDefault,
  mountApp,
  type Mounted,
} from '@/test/clientRender'
import * as Utils from '@/lib/utils'
import * as VueUse from '@vueuse/core'
import * as Aruna from '@/composables/useAruna'
import * as Catalog from '@/composables/aruna/catalog'
import * as GroupSelection from '@/composables/useGroupSelection'
import * as PathPrefixes from '@/composables/usePathPrefixes'
import * as PathTaken from '@/composables/usePathTaken'
import * as ProfilePreview from '@/composables/useProfilePreview'
import * as ProfileIri from '@/composables/aruna/profileIri'
import * as ArunaState from '@/composables/aruna/state'
import * as CrateEditor from '@/lib/crate/editor'
import * as CrateIssues from '@/lib/crate/issues'
import * as CratePaths from '@/lib/crate/paths'
import * as CratePickers from '@/lib/crate/pickers'
import * as CrateProfileSeed from '@/lib/crate/profileSeed'
import * as EditorGrid from '@/components/metadata/editor/grid'
import * as Assignable from '@/lib/profiles/assignable'
import * as Controls from '@/lib/profiles/controls'
import * as Emit from '@/lib/profiles/emit'
import * as EntityTypes from '@/lib/profiles/entityTypes'
import * as Labels from '@/lib/profiles/labels'
import * as Mode from '@/lib/profiles/mode'
import * as PropertyCatalog from '@/lib/profiles/propertyCatalog'
import * as ProfileRoCrate from '@/lib/profiles/rocrate'
import * as ProfileUri from '@/lib/profiles/uri'
import * as ProfileValidate from '@/lib/profiles/validate'
import * as Tes from '@/lib/tes'
import * as Blockers from '@/components/metadata/profile-builder/state/blockers'
import * as ProfileBuilder from '@/components/metadata/profile-builder/useProfileBuilder'
import * as TutorialFixtures from '@/lib/tutorial/fixtures/profile'
import * as TutorialProfileApi from '@/lib/tutorial/services/tutorialProfileApi'
import * as TutorialSteps from '@/lib/tutorial/steps/profile'
import * as TutorialSession from '@/lib/tutorial/session'
// The editor lifts a profile's SHACL through a dynamic import; loading it here
// keeps that resolution on the microtask queue the tests drive.
import '@/lib/shacl/lift'
import { bindTutorialRouter, exitTutorial } from '@/lib/tutorial/session'
import { apiGroups, clearIdentityState, profileItems, realmInfo, userInfo } from '@/composables/aruna/state'

export const TUTORIAL_TEST_GROUP = 'group-of-the-reader'
export const TUTORIAL_TEST_REALM = 'realm-of-the-reader'

export const markTutorialDone = vi.fn(async () => undefined)

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
const TextareaStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('textarea', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value)),
    }),
})
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const NoticeStub = defineComponent({
  props: { tone: String, title: String, lines: { type: Array, default: () => [] } },
  setup: (props, { attrs, slots }) => () =>
    h('div', { ...attrs, role: props.tone === 'error' ? 'alert' : 'status' }, [
      props.title,
      ...(props.lines as string[]).map((line) => h('p', line)),
      slots.default?.(),
    ]),
})
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () =>
    h('header', [h('h1', props.title), slots.description?.(), slots.actions?.()]),
})
const WizardStepsStub = defineComponent({
  props: { steps: { type: Array, default: () => [] }, current: Number },
  setup: (props) => () => h('nav', (props.steps as string[]).map((step) => h('span', step))),
})
const RouterLinkStub = defineComponent((_, { attrs, slots }) => () => h('a', attrs, slots.default?.()))
const icons = new Proxy({}, { get: () => GenericStub })

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
  '@/components/ui/Textarea.vue': moduleDefault(TextareaStub),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Card.vue': moduleDefault(PassThroughStub),
  '@/components/ui/Skeleton.vue': moduleDefault(GenericStub),
  '@/components/ui/Spinner.vue': moduleDefault(GenericStub),
  '@/components/ui/EmptyState.vue': moduleDefault(GenericStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(GenericStub),
  '@/components/ui/CopyButton.vue': moduleDefault(GenericStub),
  '@/components/ui/DocsLink.vue': moduleDefault(GenericStub),
  '@/components/ui/DiscardDraftConfirm.vue': moduleDefault(GenericStub),
  '@/components/ui/Tooltip.vue': moduleDefault(PassThroughStub),
  '@/components/ui/Tabs.vue': moduleDefault(PassThroughStub),
  '@/components/ui/TabsList.vue': moduleDefault(PassThroughStub),
  '@/components/ui/TabsTrigger.vue': moduleDefault(PassThroughStub),
  '@/components/ui/TabsContent.vue': moduleDefault(PassThroughStub),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/onboarding/WizardSteps.vue': moduleDefault(WizardStepsStub),
}

const builderShared = {
  vue: VueRuntime,
  'vue-router': { ...RouterRuntime, RouterLink: RouterLinkStub },
  '@lucide/vue': icons,
  ...ui,
  '@/lib/profiles/assignable': Assignable,
  '@/lib/profiles/entityTypes': EntityTypes,
  '@/lib/profiles/labels': Labels,
  '@/lib/profiles/mode': Mode,
  '@/lib/profiles/propertyCatalog': PropertyCatalog,
  '@/lib/profiles/uri': ProfileUri,
  '@/lib/utils': Utils,
  '@/components/metadata/profile-builder/useProfileBuilder': ProfileBuilder,
  './useProfileBuilder': ProfileBuilder,
}

const ProfileVisibility = compileClientComponent(
  url('components/metadata/profile-builder/ProfileVisibility.vue'),
  builderShared,
)
const PropertyRuleRow = compileClientComponent(
  url('components/metadata/profile-builder/PropertyRuleRow.vue'),
  { ...builderShared, './PropertyRuleCard.vue': moduleDefault(GenericStub) },
)
const EntityShapeSection = compileClientComponent(
  url('components/metadata/profile-builder/EntityShapeSection.vue'),
  {
    ...builderShared,
    './PropertyRuleRow.vue': moduleDefault(PropertyRuleRow),
    './PropertyTermPicker.vue': moduleDefault(GenericStub),
    './ClassPropertyChecklist.vue': moduleDefault(GenericStub),
    './EntityTypePicker.vue': moduleDefault(GenericStub),
  },
)
const ProfileEntityRulesStep = compileClientComponent(
  url('components/metadata/profile-builder/ProfileEntityRulesStep.vue'),
  {
    ...builderShared,
    './EntityShapeSection.vue': moduleDefault(EntityShapeSection),
    './EntityTypePicker.vue': moduleDefault(GenericStub),
    './LiftNotesPanel.vue': moduleDefault(GenericStub),
  },
)
const ProfileBasicsStep = compileClientComponent(
  url('components/metadata/profile-builder/ProfileBasicsStep.vue'),
  {
    ...builderShared,
    '@/components/groups/GroupSelect.vue': moduleDefault(SelectStub),
    './ProfileVisibility.vue': moduleDefault(ProfileVisibility),
    './useArtifactFetch': { useArtifactFetch: () => ({ fetching: ref(false), fetchText: vi.fn() }) },
  },
)
const ProfileReviewStep = compileClientComponent(
  url('components/metadata/profile-builder/ProfileReviewStep.vue'),
  {
    ...builderShared,
    '@/components/metadata/ProfileControlField.vue': moduleDefault(GenericStub),
    './LiftNotesPanel.vue': moduleDefault(GenericStub),
    './ProfileVisibility.vue': moduleDefault(ProfileVisibility),
    '@/lib/profiles/controls': Controls,
    '@/lib/profiles/rocrate': ProfileRoCrate,
    '@/lib/profiles/validate': ProfileValidate,
    './state/blockers': Blockers,
  },
)
const ProfileNewView = compileClientComponent(url('views/ProfileNewView.vue'), {
  ...builderShared,
  'vue-router': RouterRuntime,
  '@/components/metadata/profile-builder/ImportProfileSection.vue': moduleDefault(GenericStub),
  '@/components/metadata/profile-builder/ProfileBasicsStep.vue': moduleDefault(ProfileBasicsStep),
  '@/components/metadata/profile-builder/ProfileEntityRulesStep.vue': moduleDefault(ProfileEntityRulesStep),
  '@/components/metadata/profile-builder/ProfileReviewStep.vue': moduleDefault(ProfileReviewStep),
  '@/components/metadata/profile-builder/state/blockers': Blockers,
  '@/composables/useAruna': Aruna,
  '@/composables/useS3': { useS3: () => ({ endpoint: ref(''), hasActiveKey: ref(false), listBuckets: vi.fn() }) },
  '@/composables/useProfilePublish': { useProfilePublish: () => ({ publishProfileArtifacts: vi.fn() }) },
  '@/composables/useProfileReferences': { useProfileReferences: () => ({ warning: computed(() => null) }) },
  '@/composables/aruna/profileIri': ProfileIri,
  '@/composables/aruna/state': ArunaState,
  '@/lib/profiles/rocrate': ProfileRoCrate,
  '@/lib/tes': Tes,
})

const editorShared = {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...ui,
  '@/lib/crate/editor': CrateEditor,
  '@/lib/crate/issues': CrateIssues,
  '@/lib/utils': Utils,
}

// Stands in for the real property row: one input, the same update contract.
// The row itself is covered by its own suite; here it only has to be typable.
const PropertyRowStub = defineComponent({
  props: {
    draft: { type: Object as () => CrateEditor.CrateDraft, required: true },
    entity: { type: Object as () => CrateEditor.DraftEntity, required: true },
    property: { type: String, required: true },
  },
  emits: ['update'],
  setup: (props, { emit }) => () => {
    const stored = props.entity.properties[props.property] ?? []
    return h('input', {
      'data-row': `${props.entity.id}:${props.property}`,
      value: stored[0]?.value ?? '',
      onInput: (event: { target: { value: unknown } }) => {
        const value = String(event.target.value)
        emit('update', stored.length
          ? CrateEditor.updateValue(props.draft, props.entity.id, props.property, 0, value)
          : CrateEditor.setProperty(props.draft, props.entity.id, props.property, [{ kind: 'text', value }]))
      },
    })
  },
})
const PropertyEditorStub = defineComponent({
  props: {
    draft: { type: Object as () => CrateEditor.CrateDraft, required: true },
    entity: { type: Object as () => CrateEditor.DraftEntity, required: true },
    skip: { type: Array as () => string[], default: () => [] },
  },
  emits: ['update'],
  setup: (props, { emit }) => () =>
    h('div', Object.keys(props.entity.properties)
      .filter((property) => !props.skip.includes(property))
      .map((property) => h(PropertyRowStub, {
        draft: props.draft,
        entity: props.entity,
        property,
        onUpdate: (next: CrateEditor.CrateDraft) => emit('update', next),
      }))),
})

const RootForm = compileClientComponent(url('components/metadata/editor/RootForm.vue'), {
  ...editorShared,
  './PropertyEditor.vue': moduleDefault(PropertyEditorStub),
  './PropertyRow.vue': moduleDefault(PropertyRowStub),
  './IssueMark.vue': moduleDefault(GenericStub),
  './grid': EditorGrid,
})
const EntityEditor = compileClientComponent(url('components/metadata/editor/EntityEditor.vue'), {
  ...editorShared,
  './RootForm.vue': moduleDefault(RootForm),
  './EntityHeader.vue': moduleDefault(GenericStub),
  './PropertyEditor.vue': moduleDefault(PropertyEditorStub),
  './AddPropertyDialog.vue': moduleDefault(GenericStub),
  './AddFilesDialog.vue': moduleDefault(GenericStub),
  '@/lib/crate/pickers': CratePickers,
})
const NodeCheckPanel = compileClientComponent(url('components/metadata/editor/NodeCheckPanel.vue'), editorShared)
const IssueDrawer = compileClientComponent(url('components/metadata/editor/IssueDrawer.vue'), editorShared)
const DatasetEditorView = compileClientComponent(url('views/DatasetEditorView.vue'), {
  ...editorShared,
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(GenericStub),
  '@/components/metadata/ImportCrateDialog.vue': moduleDefault(GenericStub),
  '@/components/metadata/editor/DatasetLocationDialog.vue': moduleDefault(GenericStub),
  '@/components/metadata/editor/EntityBrowser.vue': moduleDefault(GenericStub),
  '@/components/metadata/editor/EntityEditor.vue': moduleDefault(EntityEditor),
  '@/components/metadata/editor/IssueDrawer.vue': moduleDefault(IssueDrawer),
  '@/components/metadata/editor/NodeCheckPanel.vue': moduleDefault(NodeCheckPanel),
  '@/components/metadata/editor/EditorGraph.vue': moduleDefault(GenericStub),
  '@/components/metadata/PidWithdraw.vue': moduleDefault(GenericStub),
  '@/composables/useAruna': Aruna,
  '@/composables/useGroupSelection': GroupSelection,
  '@/composables/usePathPrefixes': PathPrefixes,
  '@/composables/usePathTaken': PathTaken,
  '@/composables/useProfilePreview': ProfilePreview,
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ deviceClient: ref(null) }) },
  '@/composables/useAssistantEditor': { provideEditorBridge: () => {} },
  '@/lib/desktop': { isDesktop: () => false },
  '@/lib/deviceApi': { previewDeviceDraft: vi.fn(), requireDevice: vi.fn() },
  '@/lib/api': { apiErrorMessage: Utils.errorMessage },
  '@/lib/profiles/emit': Emit,
  '@/lib/profiles/assignable': Assignable,
  '@/lib/profiles/vocabulary': { loadVocabIndex: async () => null },
  '@/lib/crate/paths': CratePaths,
  '@/lib/crate/profileSeed': CrateProfileSeed,
})

const TutorialProfileView = compileClientComponent(url('views/TutorialProfileView.vue'), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  ...ui,
  '@/composables/aruna/catalog': Catalog,
  '@/views/ProfileNewView.vue': moduleDefault(ProfileNewView),
  '@/views/DatasetEditorView.vue': moduleDefault(DatasetEditorView),
  '@/components/metadata/profile-builder/useProfileBuilder': ProfileBuilder,
  '@/composables/useGroupSelection': GroupSelection,
  '@/composables/useOnboarding': { useOnboarding: () => ({ markTutorialDone }) },
  '@/lib/tutorial/fixtures/profile': TutorialFixtures,
  '@/lib/tutorial/services/tutorialProfileApi': TutorialProfileApi,
  '@/lib/tutorial/steps/profile': TutorialSteps,
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

/** The signed-in reader the tutorial borrows a group from. */
function seedSession() {
  clearIdentityState(true)
  profileItems.value = []
  apiGroups.value = []
  realmInfo.value = {
    realm_id: TUTORIAL_TEST_REALM,
    description: 'Test realm',
    metadata_replication: { default_replication_factor: 1 },
    oidc_providers: [],
    discovery: null,
    nodes: [],
  } as never
  userInfo.value = {
    user: { user_id: 'user-id', name: 'Ada Lovelace', subject_ids: [], attributes: {} },
    realm: { realm_id: TUTORIAL_TEST_REALM, roles: [] },
    groups: [{ group_id: TUTORIAL_TEST_GROUP, display_name: 'Survey group', roles: [] }],
    preferences: { favourite_metadata_ids: [] },
  } as never
}

/** Mounts the tutorial route through a real router, with no network at all. */
export async function mountTutorialProfile(path = '/app/tutorial/profile'): Promise<TutorialMount> {
  exitTutorial()
  markTutorialDone.mockClear()
  seedSession()
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  // Inherits the timers and storage the views use; the listeners they register
  // for wake-ups and shortcuts have somewhere to go.
  vi.stubGlobal('window', Object.assign(Object.create(globalThis), {
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  vi.stubGlobal('document', {
    hidden: false,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/tutorial/profile', name: 'tutorial-profile', component: TutorialProfileView as Component },
      { path: '/app/profiles', name: 'profiles', component: RouteStub },
      { path: '/app/profiles/new', name: 'profile-new', component: RouteStub },
      { path: '/app/profiles/:profileId', name: 'profile', component: RouteStub },
      { path: '/app/datasets', name: 'datasets', component: RouteStub },
      { path: '/app/datasets/:id', name: 'dataset', component: RouteStub },
      { path: '/app/groups/:id', name: 'group', component: RouteStub },
      { path: '/app/settings', name: 'settings', component: RouteStub },
      { path: '/app/docs/:topic?', name: 'docs', component: RouteStub },
    ],
  })
  bindTutorialRouter(router)
  await router.push(path)
  await router.isReady()
  const mounted = await mountApp(Harness, { router })
  await settle()
  return { ...mounted, router, fetchSpy }
}
