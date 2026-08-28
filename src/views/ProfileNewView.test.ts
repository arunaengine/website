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
const routerPush = vi.fn(async () => undefined)
const route = reactive({ name: 'profile-new', params: {} as Record<string, string> })
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
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { emit }) => () => h('button', {
    onClick: () => emit('update:checked', !props.checked),
  }, 'Toggle public'),
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
    useRoute: () => route,
    useRouter: () => ({ push: routerPush }),
    onBeforeRouteLeave: (guard: () => Promise<boolean>) => { leaveGuard = guard },
  },
  '@lucide/vue': icons,
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/onboarding/WizardSteps.vue': moduleDefault(WizardStepsStub),
  '@/components/ui/DiscardDraftConfirm.vue': moduleDefault(DiscardStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Tabs.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsContent.vue': moduleDefault(Passthrough),
  '@/components/metadata/profile-builder/ImportProfileSection.vue': moduleDefault(EmptyStub),
  '@/components/metadata/profile-builder/ProfileBasicsStep.vue': moduleDefault(BasicsStub),
  '@/components/metadata/profile-builder/ProfileEntityRulesStep.vue': moduleDefault(RulesStub),
  '@/components/metadata/profile-builder/ProfileReviewStep.vue': moduleDefault(EmptyStub),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/profile-builder/useProfileBuilder': ProfileBuilder,
  '@/composables/useAruna': { useAruna: () => arunaModule.value },
  '@/composables/useS3': {
    useS3: () => ({ endpoint: ref('https://s3.test'), hasActiveKey: ref(true), listBuckets }),
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

async function fillBasics(root: Parameters<typeof content>[0]) {
  await typeValue(input(root, 'data-field', 'name'), 'Example profile')
  await typeValue(input(root, 'data-field', 'description'), 'What this profile requires.')
}

beforeEach(() => {
  route.name = 'profile-new'
  route.params = {}
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
  routerPush.mockClear()
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
