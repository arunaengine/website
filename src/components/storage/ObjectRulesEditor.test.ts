import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as GroupAdmin from '@/lib/groupAdmin'
import * as PlacementPolicies from '@/lib/placementPolicies'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
  type HostNode,
} from '@/test/clientRender'
import type { GroupDetailResponse } from '@/lib/api'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const RefusalStub = defineComponent({
  props: { message: String },
  setup: (props) => () => h('div', props.message),
})
// The dialog body only exists while it is open, so a close is observable.
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const RouterLinkStub = defineComponent({
  inheritAttrs: false,
  props: { to: { type: Object, required: true } },
  setup: (props, { attrs, slots }) => () =>
    h('a', { ...attrs, to: props.to }, slots.default?.()),
})
// The real Select is a radix listbox; the options and the chosen value are what
// this surface is about, so the stub renders one button per option.
const SelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, placeholder: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', [
      props.placeholder ?? '',
      ...(props.options as Array<{ value: string; label: string }>).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
      ),
    ]),
})

const isRealmAdmin = ref(false)
const group = ref<GroupDetailResponse | null>(null)
const getGroup = vi.fn(async () => group.value)
const getObjectPlacement = vi.fn()
const listPoliciesForGroup = vi.fn()
const mintObjectPlacement = vi.fn()

const editor = compileClientComponent(new URL('./ObjectRulesEditor.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  'vue-router': { RouterLink: RouterLinkStub },
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/composables/useAruna': {
    useAruna: () => ({
      currentUser: ref({ id: 'u-1' }),
      getGroup,
      isRealmAdmin,
    }),
  },
  '@/composables/usePlacementPolicies': {
    usePlacementPolicies: () => ({
      getObjectPlacement,
      listPoliciesForGroup,
      mintObjectPlacement,
      policyName: (policy: { name?: string | null; policy_id: string }) => policy.name ?? policy.policy_id,
    }),
  },
  '@/lib/api': Api,
  '@/lib/groupAdmin': GroupAdmin,
  '@/lib/placementPolicies': PlacementPolicies,
})

function groupDetail(admin: boolean): GroupDetailResponse {
  return {
    display_name: 'Reef survey',
    group_id: 'g-1',
    realm_id: 'r-1',
    roles: admin
      ? [
          {
            role_id: 'role-1',
            name: 'Admins',
            permissions: { '/r-1/g/g-1/admin/**': 'write' },
            assigned_users: ['u-1'],
          },
        ]
      : [],
  }
}

const EU_POLICY = { policy_id: 'p-eu', digest: 'a'.repeat(64), name: 'Copies inside the EU', owner_group_id: null }
const GROUP_POLICY = { policy_id: 'p-own', digest: 'b'.repeat(64), name: 'Only our own nodes', owner_group_id: 'g-1' }
const HEAD_VERSION = '01J000000000000000000HEAD'

async function render(
  options: {
    admin?: boolean
    realmAdmin?: boolean
    versionId?: string | null
    groupFails?: boolean
    nodeId?: string | null
    library?: typeof EU_POLICY[]
  } = {},
) {
  group.value = groupDetail(options.admin ?? true)
  isRealmAdmin.value = options.realmAdmin ?? false
  if (options.groupFails) getGroup.mockRejectedValueOnce(new Error('offline'))
  const saves: number[] = []
  getObjectPlacement.mockResolvedValue({
    bucket: 'reef-survey',
    key: 'raw/reads.fastq',
    version_id: HEAD_VERSION,
    generation: 7,
    policies: [EU_POLICY],
  })
  listPoliciesForGroup.mockResolvedValue(options.library ?? [EU_POLICY, GROUP_POLICY])
  const { root } = await mountApp(editor, {
    props: {
      bucket: 'reef-survey',
      objectKey: 'raw/reads.fastq',
      // A pinned version in the dialog must not decide what the mint is against.
      versionId: options.versionId === undefined ? '01J00000000000000PINNED' : options.versionId,
      groupId: 'g-1',
      nodeId: options.nodeId ?? null,
      onSaved: () => saves.push(1),
    },
  })
  await flush()
  return Object.assign(root, { saves })
}

function trigger(root: HostNode): HostNode {
  return button(root, 'Edit rules for this file')
}

function link(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'a' && content(node).trim() === label)
}

describe('object rules editor', () => {
  it('offers the rules the head carries plus what is attachable', async () => {
    const root = await render()

    await click(button(root, 'Edit rules for this file…'))

    const text = content(root)
    expect(text).toContain('Copies inside the EU')
    expect(text).toContain('Only our own nodes (Reef survey)')
    expect(text).toContain('Saving creates a new version of this file that carries exactly these rules')
    expect(text).not.toContain('Copies inside the EU (Realm)')
  })

  it('mints a successor carrying exactly the chosen set', async () => {
    mintObjectPlacement.mockResolvedValue({ outcome: 'minted', version_id: 'v-3', policies: [] })
    const root = await render()

    await click(button(root, 'Edit rules for this file…'))
    await click(button(root, 'Only our own nodes'))
    await click(button(root, 'Save rules'))

    expect(mintObjectPlacement).toHaveBeenCalledTimes(1)
    const [bucket, body] = mintObjectPlacement.mock.calls[0]
    expect(bucket).toBe('reef-survey')
    expect(body.key).toBe('raw/reads.fastq')
    expect(body.expected_version_id).toBe(HEAD_VERSION)
    expect(body.expected_generation).toBe(7)
    expect(body.mutation_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(body.policies).toEqual([
      { policy_id: 'p-eu', digest: 'a'.repeat(64) },
      { policy_id: 'p-own', digest: 'b'.repeat(64) },
    ])
    expect(content(root)).toContain('a new version carrying exactly these rules')
  })

  it('refuses to save a key this node holds no head for', async () => {
    const root = await render()
    getObjectPlacement.mockRejectedValue(new Api.ApiError(404, 'Not found'))

    await click(button(root, 'Edit rules for this file…'))

    expect(content(root)).toContain('This file has no current version on this node.')
    expect(button(root, 'Save rules').props.disabled).toBe(true)
    expect(content(root)).not.toContain('Add a rule…')
  })

  it('shows a failed read instead of a starting set it does not know', async () => {
    const root = await render()
    getObjectPlacement.mockRejectedValue(new Api.ApiError(503, 'This node is still starting.'))

    await click(button(root, 'Edit rules for this file…'))

    const text = content(root)
    expect(text).toContain('This node is still starting.')
    expect(text).not.toContain('Copies inside the EU')
    expect(button(root, 'Save rules').props.disabled).toBe(true)
  })

  it('shows the refusal this node gave instead of a saved message', async () => {
    mintObjectPlacement.mockRejectedValue(
      new Api.ApiError(403, 'Only admins of the group that owns this bucket may set placement rules.'),
    )
    const root = await render()

    await click(button(root, 'Edit rules for this file…'))
    await click(button(root, 'Save rules'))

    const text = content(root)
    expect(text).toContain('This node refused the change.')
    expect(text).toContain('Only admins of the group that owns this bucket may set placement rules.')
    expect(text).not.toContain('a new version carrying exactly these rules')
  })

  it('emits the change so the surrounding view reloads', async () => {
    mintObjectPlacement.mockResolvedValue({ outcome: 'minted', version_id: 'v-3', policies: [] })
    const root = await render()

    await click(trigger(root))
    await click(button(root, 'Save rules'))

    expect(root.saves).toEqual([1])
  })

  it('stays visible with its reason for a viewer who may not attach rules', async () => {
    const denied = await render({ admin: false })
    expect(trigger(denied).props.disabled).toBe(true)
    expect(content(denied)).toContain('Only group admins of this bucket and realm admins')

    const allowed = await render({ admin: false, realmAdmin: true })
    expect(trigger(allowed).props.disabled).toBe(false)

    const headless = await render({ versionId: null })
    expect(trigger(headless).props.disabled).toBe(true)
    expect(content(headless)).toContain('no current version on this node')

    const elsewhere = await render({ admin: true, nodeId: 'node-b' })
    expect(trigger(elsewhere).props.disabled).toBe(true)
    expect(content(elsewhere)).toContain('Only the node that holds this bucket')
  })

  it('keeps an unread group out of the refusal', async () => {
    // A transient group lookup failure must not lock a group admin out.
    const root = await render({ admin: false, groupFails: true })

    expect(trigger(root).props.disabled).toBe(false)
  })

  it('sends a viewer to the bucket rules when none exist yet', async () => {
    const root = await render({ library: [] })

    await click(trigger(root))

    expect(content(root)).toContain('No further policy of this realm or group is available here.')
    expect(link(root, 'Create a rule for this bucket first').props.to).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef-survey' },
      query: { tab: 'placement', group: 'g-1' },
    })
  })

  it('keeps the bucket rules one click away when policies exist', async () => {
    const root = await render()

    await click(trigger(root))

    expect(content(root)).toContain('Add a rule…')
    expect(link(root, 'Manage bucket rules').props.to).toMatchObject({
      name: 'bucket-storage',
      query: { tab: 'placement' },
    })
  })

  it('points a reader at the bucket settings it may read', async () => {
    // The Placement tab is admin-gated, so a reader is sent to the overview.
    const root = await render({ admin: false })

    expect(link(root, 'Open the bucket settings').props.to).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef-survey' },
      query: { group: 'g-1' },
    })
  })

  it('closes itself instead of navigating under the dialog', async () => {
    const root = await render()

    await click(trigger(root))
    expect(content(root)).toContain('Save rules')

    await click(link(root, 'Manage bucket rules'))

    expect(content(root)).not.toContain('Save rules')
  })

  it('says the policy listing failed instead of offering none', async () => {
    listPoliciesForGroup.mockRejectedValueOnce(new Error('the node did not answer'))
    const root = await render()

    await click(trigger(root))

    expect(content(root)).toContain('the node did not answer')
    expect(button(root, 'Try again')).toBeTruthy()
  })
})
