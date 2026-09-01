import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Placement from '@/lib/placement'
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as PlacementRules from '@/lib/placementRules'
import type { RealmNodeInfo } from '@/lib/api'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  mountApp,
  moduleDefault,
  typeValue,
} from '@/test/clientRender'

function node(nodeId: string, location: string, executors: string[] = []): RealmNodeInfo {
  return {
    node_id: nodeId,
    kind: 'server',
    configured: true,
    present: true,
    connection_status: 'connected',
    placement: { location, weight: 100, full: false, draining: false },
    info: {
      executors: executors.map((kind) => ({ kind, file_staging: true, direct_s3: false })),
      labels: { tier: 'cold' },
      urls: {},
      utilization: { storage_bytes_used: 0, heartbeat_at_ms: 0 },
      updated_at_ms: 0,
    },
  }
}

const realmNodes: RealmNodeInfo[] = [node('node-eu', 'eu-west', ['docker']), node('node-us', 'us-east')]

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number] },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] }, ariaLabel: String },
  setup: (props) => () => h('select', { options: props.options, 'aria-label': props.ariaLabel }),
})
const NoticeStub = defineComponent((_, { slots }) => () => h('aside', slots.default?.()))
const RefusalStub = defineComponent({ props: { message: String }, setup: (props) => () => h('p', props.message) })
const DocsLinkStub = defineComponent({ props: { topic: String, label: String }, setup: (props) => () => h('a', props.label) })

const createPlacementPolicy = vi.fn()

const editor = compileClientComponent(new URL('./PlacementRuleEditor.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DocsLink.vue': moduleDefault(DocsLinkStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useAruna': { useAruna: () => ({ realmInfo: ref({ nodes: realmNodes }) }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: computed(() => realmNodes.map((entry) => ({ nodeId: entry.node_id, label: entry.node_id }))),
    }),
  },
  '@/composables/usePlacementPolicies': { usePlacementPolicies: () => ({ createPlacementPolicy }) },
  '@/lib/placement': Placement,
  '@/lib/placementPolicies': PlacementPolicies,
  '@/lib/placementRules': PlacementRules,
})

async function render(props: Record<string, unknown> = {}) {
  createPlacementPolicy.mockReset()
  createPlacementPolicy.mockResolvedValue({
    policy_id: 'p-1',
    digest: 'a'.repeat(64),
    name: 'EU only',
    allowed: [],
    publisher: 'node',
    created_by: 'admin',
    created_at_ms: 0,
  })
  const { root } = await mountApp(editor, { props })
  return root
}

describe('placement rule editor', () => {
  it('publishes the normalized request with its owner', async () => {
    const root = await render({ ownerGroupId: 'g-reef', ownerLabel: 'Reef survey' })

    await typeValue(element(root, (n) => n.props.id === 'policy-name'), 'EU only')
    await click(button(root, 'eu-west'))
    await click(button(root, 'Publish policy'))

    expect(createPlacementPolicy).toHaveBeenCalledWith({
      name: 'EU only',
      allowed: [{ labels: [], location: 'eu-west' }],
      owner_group_id: 'g-reef',
    })
  })

  it('refuses a card with no condition', async () => {
    const root = await render({ ownerGroupId: null, ownerLabel: 'Realm' })

    await typeValue(element(root, (n) => n.props.id === 'policy-name'), 'Anything')

    expect(content(root)).toContain('Selector 1 must constrain at least one field.')
    expect(button(root, 'Publish policy').props.disabled).toBe(true)
    expect(createPlacementPolicy).not.toHaveBeenCalled()
  })

  it('counts the realm nodes a card admits right now', async () => {
    const root = await render({ ownerGroupId: null, ownerLabel: 'Realm' })

    expect(content(root)).toContain('Matches 0 of 2 realm nodes right now.')

    await click(button(root, 'eu-west'))

    expect(content(root)).toContain('Matches 1 of 2 realm nodes right now.')
    expect(content(root)).toContain('This policy admits 1 of 2 realm nodes right now.')
  })

  it('offers no operator the backend lacks', async () => {
    const text = content(await render())

    expect(text).toContain('Copies may be stored on')
    expect(text).toContain('Anything not listed is excluded.')
    expect(text).not.toContain('Forbid')
    expect(text).not.toContain('Preferred')
    expect(text).not.toContain('Minimum copies')
    expect(text).not.toContain('Priority')
  })
})
