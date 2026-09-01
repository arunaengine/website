import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as GroupAdmin from '@/lib/groupAdmin'
import * as PlacementPolicies from '@/lib/placementPolicies'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'
import type { GroupDetailResponse } from '@/lib/api'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const RefusalStub = defineComponent({
  props: { message: String },
  setup: (props) => () => h('div', props.message),
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
const getBucketPlacement = vi.fn()
const listPoliciesForGroup = vi.fn()
const mintObjectPlacement = vi.fn()
const listObjectVersions = vi.fn()

const editor = compileClientComponent(new URL('./ObjectRulesEditor.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
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
      getGroup: () => Promise.resolve(group.value),
      isRealmAdmin,
    }),
  },
  '@/composables/usePlacementPolicies': {
    usePlacementPolicies: () => ({
      getBucketPlacement,
      listPoliciesForGroup,
      mintObjectPlacement,
      policyName: (policy: { name?: string | null; policy_id: string }) => policy.name ?? policy.policy_id,
    }),
  },
  '@/composables/useS3': { useS3: () => ({ listObjectVersions }) },
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

const BUCKET_POLICY = { policy_id: 'p-eu', digest: 'a'.repeat(64), name: 'Copies inside the EU', owner_group_id: null }
const GROUP_POLICY = { policy_id: 'p-own', digest: 'b'.repeat(64), name: 'Only our own nodes', owner_group_id: 'g-1' }

async function render(options: { admin?: boolean; realmAdmin?: boolean; versionId?: string | null } = {}) {
  group.value = groupDetail(options.admin ?? true)
  isRealmAdmin.value = options.realmAdmin ?? false
  getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', generation: 3, policies: [BUCKET_POLICY] })
  listPoliciesForGroup.mockResolvedValue([BUCKET_POLICY, GROUP_POLICY])
  listObjectVersions.mockResolvedValue({
    versions: [{ versionId: 'v-2' }, { versionId: 'v-1' }],
    truncated: false,
  })
  const { root } = await mountApp(editor, {
    props: {
      bucket: 'reef-survey',
      objectKey: 'raw/reads.fastq',
      versionId: options.versionId === undefined ? '01J000000000000000000HEAD' : options.versionId,
      groupId: 'g-1',
      nodeId: null,
    },
  })
  await flush()
  return root
}

describe('object rules editor', () => {
  it('offers the bucket rules as the starting set plus what is attachable', async () => {
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
    expect(body.expected_version_id).toBe('01J000000000000000000HEAD')
    expect(body.expected_generation).toBe(2)
    expect(body.mutation_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(body.policies).toEqual([
      { policy_id: 'p-eu', digest: 'a'.repeat(64) },
      { policy_id: 'p-own', digest: 'b'.repeat(64) },
    ])
    expect(content(root)).toContain('a new version carrying exactly these rules')
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

  it('stays hidden for a viewer who may not attach rules', async () => {
    expect(content(await render({ admin: false }))).toBe('')
    expect(content(await render({ admin: false, realmAdmin: true }))).toContain('Edit rules')
    expect(content(await render({ versionId: null }))).toBe('')
  })
})
