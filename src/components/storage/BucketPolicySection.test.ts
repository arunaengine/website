import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useRefresh } from '@/composables/useRefresh'
import * as Api from '@/lib/api'
import * as PlacementPolicies from '@/lib/placementPolicies'
import type { PolicyResponse } from '@/lib/placementPolicies'
import {
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
} from '@/test/clientRender'

const digestOne = 'a'.repeat(64)
const digestTwo = 'b'.repeat(64)
const digestThree = 'c'.repeat(64)

function policy(id: string, digest: string, name: string, owner: string | null): PolicyResponse {
  return {
    policy_id: id,
    digest,
    name,
    allowed: [],
    publisher: 'node',
    created_by: 'admin',
    created_at_ms: 0,
    owner_group_id: owner,
  }
}

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] } },
  setup: (props) => () => h('select', { options: props.options }),
})
const MessageStub = defineComponent({ props: { message: String }, setup: (props) => () => h('p', props.message) })

const getBucketPlacement = vi.fn()
const listPoliciesForGroup = vi.fn()

const section = compileClientComponent(new URL('./BucketPolicySection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/ErrorPanel.vue': moduleDefault(MessageStub),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/RefusalNote.vue': moduleDefault(MessageStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/components/storage/PlacementRuleEditor.vue': moduleDefault(Slotted('form')),
  '@/composables/usePlacementPolicies': {
    usePlacementPolicies: () => ({
      getBucketPlacement,
      putBucketPlacement: vi.fn(),
      listPoliciesForGroup,
      policyName: (entry: { name?: string | null; policy_id: string }) => entry.name ?? entry.policy_id,
    }),
  },
  '@/composables/useRefresh': { useRefresh },
  '@/lib/api': Api,
  '@/lib/placementPolicies': PlacementPolicies,
})

async function render(props: Record<string, unknown> = {}) {
  const { root } = await mountApp(section, {
    props: {
      bucket: 'reef-survey',
      groupId: 'g-1',
      groupName: 'Reef survey',
      canPublishForGroup: true,
      canPublishForRealm: false,
      ...props,
    },
  })
  await flush()
  return root
}

describe('bucket policy section', () => {
  it('names the attached policies and their owner', async () => {
    getBucketPlacement.mockResolvedValue({
      bucket: 'reef-survey',
      generation: 3,
      policies: [{ policy_id: 'p-eu', digest: digestOne, name: 'Copies inside the EU', owner_group_id: null }],
    })
    listPoliciesForGroup.mockResolvedValue([])

    const text = content(await render())

    expect(text).toContain('Where copies may be stored')
    expect(text).toContain('Copies inside the EU')
    expect(text).toContain('Realm')
    expect(text).not.toContain(digestOne)
  })

  it('offers the realm and group policies that are not attached yet', async () => {
    getBucketPlacement.mockResolvedValue({
      bucket: 'reef-survey',
      generation: 3,
      policies: [{ policy_id: 'p-eu', digest: digestOne }],
    })
    listPoliciesForGroup.mockResolvedValue([
      policy('p-eu', digestOne, 'Copies inside the EU', null),
      policy('p-inst', digestTwo, 'A copy at institute X', null),
      policy('p-own', digestThree, 'Only our own nodes', 'g-1'),
    ])

    const options = element(await render(), (node) => node.tag === 'select').props.options

    expect(options).toEqual([
      { value: `p-inst:${digestTwo}`, label: 'A copy at institute X (Realm)' },
      { value: `p-own:${digestThree}`, label: 'Only our own nodes (Reef survey)' },
    ])
  })

  it('says who may read it when the node refuses', async () => {
    getBucketPlacement.mockRejectedValue(new Api.ApiError(403, 'Forbidden'))
    listPoliciesForGroup.mockResolvedValue([])

    const text = content(await render())

    expect(text).toContain('Forbidden')
    expect(text).not.toContain('None: copies of this bucket are not governed')
  })

  it('states none instead of leaving the fact blank', async () => {
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', generation: 1, policies: [] })
    listPoliciesForGroup.mockResolvedValue([])

    expect(content(await render())).toContain('None: copies of this bucket are not governed')
  })
})
