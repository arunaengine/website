import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'
import * as Assignable from '@/lib/profiles/assignable'
import * as Labels from '@/lib/profiles/labels'
import * as ProfileMode from '@/lib/profiles/mode'
import * as Rocrate from '@/lib/profiles/rocrate'
import * as ProfileUri from '@/lib/profiles/uri'
import * as EntityTypes from '@/lib/profiles/entityTypes'
import * as Lift from '@/lib/shacl/lift'
import * as Utils from '@/lib/utils'
import * as FirstPaint from '@/composables/useFirstPaint'
import type { MetadataProfile } from '@/data/types'

const profile: MetadataProfile = {
  id: 'example',
  documentId: 'doc-1',
  name: 'Example profile',
  shortName: 'Example',
  description: 'Stored description',
  domain: 'RO-Crate Profile',
  version: '0.1.0',
  iconColor: '#335DC6',
  entityRules: [],
  propertyRules: [],
  suggestedKeywords: [],
  managed: false,
}

const profiles = ref<MetadataProfile[]>([profile])
const profileItems = ref([{ document_id: 'doc-1', group_id: 'group-1' }])
const currentUser = ref<{ id: string; preferredProfileId?: string } | null>({ id: 'user-1' })
const userInfo = ref({ groups: [{ group_id: 'group-1' }] })
const profileCrateParses = ref<Record<string, unknown>>({ 'doc-1': { entityRules: [] } })
const fullCrates = ref<Record<string, unknown>>({})
const saving = ref(false)
const loading = ref(false)
const bootstrapped = ref(true)
const routerPush = vi.fn(async () => undefined)
const route = reactive({ name: 'profiles', params: {} as Record<string, string> })

const EmptyStub = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => EmptyStub })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), slots.actions?.()]),
})

const ProfilesView = compileClientComponent(new URL('./ProfilesView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRoute: () => route, useRouter: () => ({ push: routerPush }) },
  '@lucide/vue': icons,
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DocsLink.vue': moduleDefault(EmptyStub),
  '@/components/ui/ExternalLink.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/components/ui/EmptyState.vue': moduleDefault(Passthrough),
  '@/components/ui/ListSkeleton.vue': moduleDefault(EmptyStub),
  '@/components/ui/SectionSkeleton.vue': moduleDefault(EmptyStub),
  '@/components/metadata/profile-builder/LiftNotesPanel.vue': moduleDefault(EmptyStub),
  '@/composables/useFirstPaint': FirstPaint,
  '@/composables/useAruna': {
    profileRulesLoadState: () => 'ready',
    useAruna: () => ({
      profiles,
      profileItems,
      currentUser,
      userInfo,
      loading,
      bootstrapped,
      updateUserProfile: vi.fn(),
      saving,
      loadRoCrate: vi.fn(),
      loadProfileCrate: vi.fn(async () => ({})),
      profileCrateParses,
      deleteMetadataDocument: vi.fn(),
      fullCrates,
      refreshProfiles: vi.fn(async () => undefined),
    }),
  },
  '@/lib/profiles/assignable': Assignable,
  '@/lib/profiles/labels': Labels,
  '@/lib/profiles/mode': ProfileMode,
  '@/lib/profiles/rocrate': Rocrate,
  '@/lib/profiles/uri': ProfileUri,
  '@/lib/profiles/entityTypes': EntityTypes,
  '@/lib/shacl/lift': Lift,
  '@/lib/utils': Utils,
})

beforeEach(() => {
  routerPush.mockClear()
  profiles.value = [profile]
})

describe('ProfilesView', () => {
  it('marks a group profile and offers to publish it', async () => {
    const mounted = await mountApp(ProfilesView)
    const text = content(mounted.root)

    expect(text).toContain('Group only')
    expect(text).toContain('datasets of this group may declare it')

    await click(button(mounted.root, 'Make public'))
    expect(routerPush).toHaveBeenCalledWith({
      name: 'profile-edit',
      params: { profileId: 'example' },
      query: { visibility: 'public' },
    })
    mounted.app.unmount()
  })

  it('marks a public profile as public', async () => {
    profiles.value = [{ ...profile, managed: true }]
    const mounted = await mountApp(ProfilesView)

    expect(content(mounted.root)).toContain('Public')
    expect(() => button(mounted.root, 'Make public')).toThrow()
    mounted.app.unmount()
  })

  it('routes the create and edit actions to the profile wizard', async () => {
    const mounted = await mountApp(ProfilesView)

    await click(button(mounted.root, 'New profile'))
    expect(routerPush).toHaveBeenCalledWith({ name: 'profile-new' })

    await click(button(mounted.root, 'Edit'))
    expect(routerPush).toHaveBeenCalledWith({ name: 'profile-edit', params: { profileId: 'example' } })
    mounted.app.unmount()
  })
})
