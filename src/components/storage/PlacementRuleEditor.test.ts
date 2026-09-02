import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  nodes as hostNodes,
  typeValue,
  type HostNode,
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
      labels: { tier: 'cold', 'aruna-engine.org/node': nodeId },
      urls: {},
      utilization: { storage_bytes_used: 0, heartbeat_at_ms: 0 },
      updated_at_ms: 0,
    },
  }
}

const TWO_NODES: RealmNodeInfo[] = [node('node-eu', 'eu-west', ['docker']), node('node-us', 'us-east')]
const realmNodes = ref<RealmNodeInfo[]>(TWO_NODES)

interface Option {
  value: string
  label: string
}

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
// The real Select is a radix listbox; the options and the chosen value are what
// this surface is about, so the stub renders one button per option.
const SelectStub = defineComponent({
  props: {
    modelValue: String,
    options: { type: Array, default: () => [] },
    ariaLabel: String,
    label: String,
    placeholder: String,
  },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'select',
      { 'aria-label': props.ariaLabel, value: props.modelValue, options: props.options },
      (props.options as Option[]).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
      ),
    ),
})
const NoticeStub = defineComponent((_, { slots }) => () => h('aside', slots.default?.()))
const RefusalStub = defineComponent({ props: { message: String }, setup: (props) => () => h('p', props.message) })
const DocsLinkStub = defineComponent({
  props: { topic: String, section: String, icon: Boolean },
  setup: (props) => () => h('a', { 'data-section': props.section, 'data-icon': props.icon }),
})

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
  '@/composables/useAruna': { useAruna: () => ({ realmInfo: computed(() => ({ nodes: realmNodes.value })) }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: computed(() => realmNodes.value.map((entry) => ({ nodeId: entry.node_id, label: entry.node_id }))),
    }),
  },
  '@/composables/usePlacementPolicies': { usePlacementPolicies: () => ({ createPlacementPolicy }) },
  '@/lib/placement': Placement,
  '@/lib/placementPolicies': PlacementPolicies,
  '@/lib/placementRules': PlacementRules,
})

async function render(props: Record<string, unknown> = { ownerGroupId: null, ownerLabel: 'Realm' }) {
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

function select(root: HostNode, ariaLabel: string): HostNode {
  return element(root, (entry) => entry.tag === 'select' && entry.props['aria-label'] === ariaLabel)
}

function optionLabels(root: HostNode, ariaLabel: string): string[] {
  return (select(root, ariaLabel).props.options as Option[]).map((option) => option.label)
}

function pick(root: HostNode, ariaLabel: string, optionLabel: string) {
  return click(element(select(root, ariaLabel), (entry) => entry.tag === 'button' && content(entry) === optionLabel))
}

describe('placement rule editor', () => {
  beforeEach(() => {
    realmNodes.value = TWO_NODES
  })

  it('publishes the normalized request with its owner', async () => {
    const root = await render({ ownerGroupId: 'g-reef', ownerLabel: 'Reef survey' })

    await typeValue(element(root, (n) => n.props.id === 'policy-name'), 'EU only')
    await click(button(root, 'Nodes matching'))
    await pick(root, 'Location of card 1', 'eu-west')
    await click(button(root, 'Publish policy'))

    expect(createPlacementPolicy).toHaveBeenCalledWith({
      name: 'EU only',
      allowed: [{ labels: [], location: 'eu-west' }],
      owner_group_id: 'g-reef',
    })
  })

  it('publishes one named node as a card of its own', async () => {
    const root = await render()

    await typeValue(element(root, (n) => n.props.id === 'policy-name'), 'Our node')
    await pick(root, 'Node of card 1', 'node-us')
    await click(button(root, 'Publish policy'))

    expect(createPlacementPolicy).toHaveBeenCalledWith({
      name: 'Our node',
      allowed: [{ labels: [], node_id: 'node-us' }],
    })
  })

  it('asks for a name before publishing', async () => {
    const root = await render()

    expect(content(root)).toContain('A name is required.')
    expect(element(root, (n) => n.props.id === 'policy-name').props['aria-required']).toBe('true')

    await typeValue(element(root, (n) => n.props.id === 'policy-name'), 'EU only')

    expect(content(root)).not.toContain('A name is required.')
  })

  it('refuses a card with no condition', async () => {
    const root = await render()

    await typeValue(element(root, (n) => n.props.id === 'policy-name'), 'Anything')

    expect(content(root)).toContain('Card 1 must constrain at least one field.')
    expect(button(root, 'Publish policy').props.disabled).toBe(true)
    expect(createPlacementPolicy).not.toHaveBeenCalled()
  })

  it('counts the realm nodes a card admits right now', async () => {
    const root = await render()

    expect(content(root)).toContain('Matches 0 of 2 nodes.')

    await click(button(root, 'Nodes matching'))
    await pick(root, 'Location of card 1', 'eu-west')

    expect(content(root)).toContain('Matches 1 of 2 nodes.')
    expect(content(root)).toContain('This policy admits 1 of 2 nodes right now.')
  })

  it('starts a card over when its mode switches', async () => {
    // A node id must never travel into a matching card, nor a location into a node card.
    const root = await render()

    await pick(root, 'Node of card 1', 'node-eu')
    expect(content(root)).toContain('Matches 1 of 2 nodes.')

    await click(button(root, 'Nodes matching'))
    expect(content(root)).toContain('Matches 0 of 2 nodes.')
    expect(select(root, 'Location of card 1').props.value).toBe('*')

    await pick(root, 'Location of card 1', 'eu-west')
    expect(content(root)).toContain('Matches 1 of 2 nodes.')

    await click(button(root, 'One node'))
    expect(content(root)).toContain('Matches 0 of 2 nodes.')
    expect(select(root, 'Node of card 1').props.value).toBe('')
  })

  it('offers only what the realm publishes, never a free text field', async () => {
    const root = await render()

    expect(optionLabels(root, 'Node of card 1')).toEqual(['node-eu', 'node-us'])

    await click(button(root, 'Nodes matching'))
    await click(button(root, 'Add label'))

    expect(optionLabels(root, 'Location of card 1')).toEqual(['Any', 'eu-west', 'us-east'])
    expect(optionLabels(root, 'Executor of card 1')).toEqual(['Any', 'docker'])
    // The node id label duplicates the "One node" mode, so it is not offered.
    expect(optionLabels(root, 'Label key 1 of card 1')).toEqual(['tier'])
    expect(optionLabels(root, 'Label value 1 of card 1')).toEqual(['cold'])
    expect(hostNodes(root).filter((entry) => entry.tag === 'input')).toHaveLength(1)
  })

  it('sends a picked label pair as one AND condition', async () => {
    const root = await render()

    await typeValue(element(root, (n) => n.props.id === 'policy-name'), 'Cold tier')
    await click(button(root, 'Nodes matching'))
    await click(button(root, 'Add label'))
    expect(content(root)).toContain('Matches 2 of 2 nodes.')

    await pick(root, 'Executor of card 1', 'docker')
    expect(content(root)).toContain('Matches 1 of 2 nodes.')

    await click(button(root, 'Publish policy'))

    expect(createPlacementPolicy).toHaveBeenCalledWith({
      name: 'Cold tier',
      allowed: [{ labels: [{ key: 'tier', value: 'cold' }], executor_kind: 'docker' }],
    })
  })

  it('says so when the realm has no node to pick', async () => {
    realmNodes.value = []
    const root = await render()

    const text = content(root)
    expect(text).toContain('No node has joined this realm yet')
    expect(text).not.toContain('One node')
    expect(text).not.toContain('Matches 0 of 0')
    expect(hostNodes(root).filter((entry) => entry.tag === 'select')).toHaveLength(0)
    expect(button(root, 'Publish policy').props.disabled).toBe(true)
  })

  it('offers no operator the backend lacks', async () => {
    const root = await render()
    const text = content(root)

    expect(text).toContain('Copies may be stored on')
    expect(text).toContain('anything not listed is excluded.')
    expect(text).toContain('Allow')
    expect(text).not.toContain('Learn about')
    expect(text).not.toContain('Forbid')
    expect(text).not.toContain('Preferred')
    expect(text).not.toContain('Minimum copies')
    expect(text).not.toContain('Priority')
    expect(element(root, (entry) => entry.tag === 'a').props['data-section']).toBe('Placement policies')
  })
})
