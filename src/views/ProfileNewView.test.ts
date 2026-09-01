import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  flush,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'

// The view builds its draft with the real composable, so the composable's own
// useAruna import has to see the same fixtures the view does.
const arunaModule = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => arunaModule.value,
  profileReferenceIri: () => undefined,
}))

import * as ProfileMode from '@/lib/profiles/mode'
import * as Rocrate from '@/lib/profiles/rocrate'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import * as ProfileBuilder from '@/components/metadata/profile-builder/useProfileBuilder'
import * as Blockers from '@/components/metadata/profile-builder/state/blockers'
import { DX_PROFILE, RO_CRATE_PROFILE, type ProfileEntityRule } from '@/lib/profiles/types'
import type { MetadataProfile } from '@/data/types'

const groups = ref([{ id: 'group-1', name: 'Research group' }])
const profiles = ref<MetadataProfile[]>([])
const profileItems = ref<Array<{ document_id: string; group_id: string }>>([])
const saving = ref(false)
const currentUser = ref<{ id: string } | null>({ id: 'user-1' })
const createMetadata = vi.fn()
const replaceMetadataRoCrate = vi.fn()
const loadProfileCrate = vi.fn()
const publishProfileArtifacts = vi.fn()
const listBuckets = vi.fn()
const s3Endpoint = ref('https://s3.test')
const s3HasKey = ref(true)
const routerPush = vi.fn(async () => undefined)
const route = reactive({
  name: 'profile-new',
  params: {} as Record<string, string>,
  query: {} as Record<string, string>,
})
let leaveGuard: (() => Promise<boolean>) | null = null

arunaModule.value = {
  groups,
  profiles,
  profileItems,
  createMetadata,
  replaceMetadataRoCrate,
  loadProfileCrate,
  saving,
  currentUser,
}

const EmptyStub = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => EmptyStub })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const RouterLinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (_, { slots }) => () => h('a', slots.default?.()),
})
// Stands in for the shared localStorage helpers the intro card remembers with.
const stored = ref('')
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs,
    value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('select', { ...attrs, value: props.modelValue }),
})
const NoticeStub = defineComponent({
  props: { title: String, lines: { type: Array, default: () => [] } },
  setup: (props, { slots }) => () => h('div', [
    h('span', props.title),
    ...(props.lines as string[]).map((line) => h('p', line)),
    slots.default?.(),
  ]),
})
const PageHeaderStub = defineComponent({
  props: { title: String, description: String, eyebrow: String },
  setup: (props) => () => h('header', [h('span', props.eyebrow), h('h1', props.title), h('p', props.description)]),
})
const WizardStepsStub = defineComponent({
  props: { steps: { type: Array, default: () => [] }, current: Number },
  setup: (props) => () => h('ol', (props.steps as string[]).map((label, index) =>
    h('li', `${label}${index === props.current ? ' (current)' : ''}`))),
})
const DiscardStub = defineComponent({
  props: { open: Boolean },
  emits: ['keep', 'discard'],
  setup: (props, { emit }) => () => props.open
    ? h('div', [
        h('span', 'Discard this draft?'),
        h('button', { onClick: () => emit('keep') }, 'Keep editing'),
        h('button', { onClick: () => emit('discard') }, 'Discard'),
      ])
    : null,
})

// Drives the real builder the way the basics step does, so the draft the view
// submits is the one the composable produced.
const BasicsStub = defineComponent({
  props: { builder: { type: Object, required: true }, locked: Boolean },
  setup: (props) => () => h('div', [
    h('span', props.locked ? 'Basics locked' : 'Basics editable'),
    h('span', `Group ${props.builder.groupId}`),
    h('input', {
      'data-field': 'name',
      value: props.builder.name,
      onInput: (event: { target: { value: string } }) => (props.builder.name = event.target.value),
    }),
    h('input', {
      'data-field': 'description',
      value: props.builder.description,
      onInput: (event: { target: { value: string } }) => (props.builder.description = event.target.value),
    }),
    h('button', { onClick: () => (props.builder.isPublic = !props.builder.isPublic) }, 'Toggle visibility'),
  ]),
})
// Renders the blocker list the view computed, so a test can read the same
// sentences the summary shows.
const ReviewStub = defineComponent({
  props: { blockers: { type: Array, default: () => [] } },
  emits: ['step'],
  setup: (props) => () => h('div', [
    h('p', (props.blockers as Array<{ message: string }>).length
      ? 'This profile cannot be created yet.'
      : 'This profile is ready to create.'),
    ...(props.blockers as Array<{ message: string }>).map((blocker) => h('p', blocker.message)),
  ]),
})
const RulesStub = defineComponent({
  props: { builder: { type: Object, required: true } },
  setup: (props) => () => h('div', [
    h('span', `Entity rules ${props.builder.entities.length}`),
    h('button', {
      onClick: () => props.builder.addEntityRuleForType('http://schema.org/Person', 'Person'),
    }, 'Add entity rule'),
  ]),
})

const ProfileNewView = compileClientComponent(new URL('./ProfileNewView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': {
    RouterLink: RouterLinkStub,
    useRoute: () => route,
    useRouter: () => ({ push: routerPush }),
    onBeforeRouteLeave: (guard: () => Promise<boolean>) => { leaveGuard = guard },
  },
  '@lucide/vue': icons,
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/onboarding/WizardSteps.vue': moduleDefault(WizardStepsStub),
  '@/components/ui/DiscardDraftConfirm.vue': moduleDefault(DiscardStub),
  '@/components/ui/DocsLink.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Tabs.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsContent.vue': moduleDefault(Passthrough),
  '@/components/metadata/profile-builder/ImportProfileSection.vue': moduleDefault(EmptyStub),
  '@/components/metadata/profile-builder/ProfileBasicsStep.vue': moduleDefault(BasicsStub),
  '@/components/metadata/profile-builder/ProfileEntityRulesStep.vue': moduleDefault(RulesStub),
  '@/components/metadata/profile-builder/ProfileReviewStep.vue': moduleDefault(ReviewStub),
  '@/components/metadata/profile-builder/state/blockers': Blockers,
  '@/components/metadata/profile-builder/useProfileBuilder': ProfileBuilder,
  '@/composables/useAruna': { useAruna: () => arunaModule.value },
  '@/composables/aruna/state': { readStored: () => stored.value, storeValue: (_key: string, value: string) => (stored.value = value) },
  '@/composables/useS3': {
    useS3: () => ({ endpoint: s3Endpoint, hasActiveKey: s3HasKey, listBuckets }),
  },
  '@/composables/useProfilePublish': { useProfilePublish: () => ({ publishProfileArtifacts }) },
  '@/lib/profiles/rocrate': Rocrate,
  '@/lib/profiles/mode': ProfileMode,
  '@/lib/tes': Tes,
  '@/lib/utils': Utils,
})

const rootRule: ProfileEntityRule = {
  id: 'dataset',
  label: 'Root dataset',
  description: '',
  type: 'http://schema.org/Dataset',
  className: 'Dataset',
  propertyRules: [{
    id: 'name',
    label: 'Name',
    description: '',
    kind: 'text',
    propertyUri: 'http://schema.org/name',
    valueName: 'name',
    obligation: 'MUST',
  }],
}

const storedProfile: MetadataProfile = {
  id: 'example',
  documentId: 'doc-1',
  name: 'Example profile',
  shortName: 'Example',
  description: 'Stored description',
  domain: 'RO-Crate Profile',
  version: '0.2.0',
  iconColor: '#335DC6',
  entityRules: [rootRule],
  propertyRules: rootRule.propertyRules,
  suggestedKeywords: [],
  managed: false,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function fillBasics(root: Parameters<typeof content>[0]) {
  await typeValue(input(root, 'data-field', 'name'), 'Example profile')
  await typeValue(input(root, 'data-field', 'description'), 'What this profile requires.')
}

beforeEach(() => {
  route.name = 'profile-new'
  route.params = {}
  route.query = {}
  groups.value = [{ id: 'group-1', name: 'Research group' }]
  profiles.value = []
  profileItems.value = []
  currentUser.value = { id: 'user-1' }
  saving.value = false
  leaveGuard = null
  createMetadata.mockReset().mockResolvedValue({
    document_id: 'doc-new',
    document_path: 'profiles/example-profile',
    graph_iri: 'https://example.test/profiles/example-profile',
  })
  replaceMetadataRoCrate.mockReset().mockResolvedValue(undefined)
  loadProfileCrate.mockReset().mockResolvedValue({})
  publishProfileArtifacts.mockReset().mockResolvedValue(undefined)
  listBuckets.mockReset().mockResolvedValue([])
  s3Endpoint.value = 'https://s3.test'
  s3HasKey.value = true
  routerPush.mockClear()
  stored.value = ''
})

describe('ProfileNewView create', () => {
  it('submits the draft and opens the new profile', async () => {
    const mounted = await mountApp(ProfileNewView)
    expect(content(mounted.root)).toContain('New profile')

    await fillBasics(mounted.root)
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Add entity rule'))
    expect(content(mounted.root)).toContain('Entity rules 2')
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Create profile'))
    await flush()

    const request = createMetadata.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      group_id: 'group-1',
      path: 'profiles/example-profile',
      public: true,
    })
    expect(publishProfileArtifacts).toHaveBeenCalled()
    const graph = request.rocrate['@graph'] as Array<Record<string, unknown>>
    expect(graph.find((entity) => entity['@id'] === 'ro-crate-metadata.json')?.conformsTo)
      .toEqual({ '@id': RO_CRATE_PROFILE })
    // The rule added on the second step travels into the submitted crate.
    expect(JSON.stringify(request.rocrate)).toContain('Person')
    expect(graph.find((entity) => entity['@id'] === './')).toMatchObject({
      '@type': ['Dataset', DX_PROFILE],
      name: 'Example profile',
    })
    expect(routerPush).toHaveBeenCalledWith({ name: 'profile', params: { profileId: 'example-profile' } })
    mounted.app.unmount()
  })

  it('gates the summary and the button on one blocker list', async () => {
    // Every scenario asserts the readiness sentence and `disabled` together.
    const scenarios = [
      { name: 'public without an S3 key', setup: () => { s3HasKey.value = false }, blocker: 'Publishing a public profile needs S3 credentials for this group.' },
      { name: 'public on a node without S3', setup: () => { s3Endpoint.value = '' }, blocker: 'Publishing a public profile needs S3 storage, and this node advertises no S3 endpoint.' },
      // A name taken while the author was on a later step: step 1 already
      // refuses Next, so the review summary is where it has to show up.
      { name: 'a name already taken', late: true, setup: () => { profiles.value = [storedProfile] }, blocker: 'A profile with this name already exists.' },
    ]

    for (const scenario of scenarios) {
      s3Endpoint.value = 'https://s3.test'
      s3HasKey.value = true
      profiles.value = []
      if (!scenario.late) scenario.setup()
      const mounted = await mountApp(ProfileNewView)
      await fillBasics(mounted.root)
      await click(button(mounted.root, 'Next'))
      await click(button(mounted.root, 'Next'))
      if (scenario.late) {
        scenario.setup()
        await flush()
      }

      const text = content(mounted.root)
      expect(text, scenario.name).toContain('This profile cannot be created yet.')
      expect(text, scenario.name).toContain(scenario.blocker)
      expect(button(mounted.root, 'Create profile').props.disabled, scenario.name).toBe(true)
      mounted.app.unmount()
    }
  })

  it('creates a group profile without any S3 credentials', async () => {
    s3HasKey.value = false
    const mounted = await mountApp(ProfileNewView)
    await fillBasics(mounted.root)
    await click(button(mounted.root, 'Toggle visibility'))
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Next'))

    expect(content(mounted.root)).toContain('This profile is ready to create.')
    expect(button(mounted.root, 'Create profile').props.disabled).toBe(false)

    await click(button(mounted.root, 'Create profile'))
    await flush()
    expect(createMetadata.mock.calls[0]?.[0]).toMatchObject({ public: false })
    expect(publishProfileArtifacts).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('introduces profiles once, until the reader dismisses it', async () => {
    const mounted = await mountApp(ProfileNewView)
    expect(content(mounted.root)).toContain('A profile is the checklist')

    await click(button(mounted.root, 'Got it'))
    expect(content(mounted.root)).not.toContain('A profile is the checklist')
    expect(stored.value).toBe('true')
    mounted.app.unmount()

    const returning = await mountApp(ProfileNewView)
    expect(content(returning.root)).not.toContain('A profile is the checklist')
    returning.app.unmount()
  })

  it('fills the default group once the group list arrives', async () => {
    groups.value = []
    const mounted = await mountApp(ProfileNewView)
    expect(content(mounted.root)).toContain('Group ')
    expect(content(mounted.root)).not.toContain('Group group-2')

    groups.value = [{ id: 'group-2', name: 'Late group' }]
    await flush()

    expect(content(mounted.root)).toContain('Group group-2')
    mounted.app.unmount()
  })
})

describe('ProfileNewView edit', () => {
  beforeEach(() => {
    route.name = 'profile-edit'
    route.params = { profileId: 'example' }
    profiles.value = [storedProfile]
    profileItems.value = [{ document_id: 'doc-1', group_id: 'group-1' }]
  })

  it('seeds the stored crate and saves it in place', async () => {
    const mounted = await mountApp(ProfileNewView)
    await flush()

    expect(loadProfileCrate).toHaveBeenCalledWith('doc-1')
    const text = content(mounted.root)
    expect(text).toContain('Edit profile')
    expect(text).toContain('Basics locked')
    expect(input(mounted.root, 'data-field', 'name').value).toBe('Example profile')

    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Save profile'))
    await flush()

    expect(replaceMetadataRoCrate).toHaveBeenCalledWith('doc-1', expect.objectContaining({
      rocrate: expect.objectContaining({ '@graph': expect.any(Array) }),
      public: false,
    }))
    expect(createMetadata).not.toHaveBeenCalled()
    expect(routerPush).toHaveBeenCalledWith({ name: 'profile', params: { profileId: 'example' } })
    mounted.app.unmount()
  })

  it('opens on the public choice when Make public sent the author here', async () => {
    route.query = { visibility: 'public' }
    const mounted = await mountApp(ProfileNewView)
    await flush()

    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Save profile'))
    await flush()

    expect(replaceMetadataRoCrate).toHaveBeenCalledWith('doc-1', expect.objectContaining({ public: true }))
    mounted.app.unmount()
  })

  it('fences profile seeding when the edit route changes', async () => {
    const otherProfile: MetadataProfile = {
      ...storedProfile,
      id: 'other',
      documentId: 'doc-2',
      name: 'Other profile',
      shortName: 'Other',
    }
    profiles.value = [storedProfile, otherProfile]
    profileItems.value.push({ document_id: 'doc-2', group_id: 'group-1' })
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    loadProfileCrate.mockImplementation((id: string) => id === 'doc-1' ? first.promise : second.promise)
    const mounted = await mountApp(ProfileNewView)

    route.params = { profileId: 'other' }
    await flush()
    second.resolve({})
    await flush()
    expect(input(mounted.root, 'data-field', 'name').value).toBe('Other profile')

    first.resolve({})
    await flush()
    expect(input(mounted.root, 'data-field', 'name').value).toBe('Other profile')
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Save profile'))
    await flush()
    expect(replaceMetadataRoCrate).toHaveBeenCalledWith('doc-2', expect.anything())
    mounted.app.unmount()
  })

  it('resets the builder when an edit route becomes create', async () => {
    const mounted = await mountApp(ProfileNewView)
    await flush()
    expect(input(mounted.root, 'data-field', 'name').value).toBe('Example profile')

    route.name = 'profile-new'
    route.params = {}
    await flush()

    expect(content(mounted.root)).toContain('New profile')
    expect(input(mounted.root, 'data-field', 'name').value).toBe('')
    mounted.app.unmount()
  })
})

describe('ProfileNewView draft guard', () => {
  it('asks before leaving with unsaved edits and keeps the draft', async () => {
    const mounted = await mountApp(ProfileNewView)
    await fillBasics(mounted.root)

    const leaving = leaveGuard?.()
    await flush()
    expect(content(mounted.root)).toContain('Discard this draft?')

    await click(button(mounted.root, 'Keep editing'))
    await expect(leaving).resolves.toBe(false)
    expect(content(mounted.root)).not.toContain('Discard this draft?')
    mounted.app.unmount()
  })

  it('leaves on discard, and leaves silently after a submit', async () => {
    const mounted = await mountApp(ProfileNewView)
    await fillBasics(mounted.root)

    const leaving = leaveGuard?.()
    await flush()
    await click(button(mounted.root, 'Discard'))
    await expect(leaving).resolves.toBe(true)

    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Next'))
    await click(button(mounted.root, 'Create profile'))
    await flush()

    await expect(leaveGuard?.()).resolves.toBe(true)
    expect(content(mounted.root)).not.toContain('Discard this draft?')
    mounted.app.unmount()
  })
})
