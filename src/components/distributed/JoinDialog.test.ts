import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Mock from '@/lib/distributedMock'
import * as Distribution from '@/lib/distribution'
import { button, compileClientComponent, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const join = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', { 'data-select': props.ariaLabel }, (props.options as Array<{ value: string; label: string }>).map((option) =>
      h('button', { 'data-select-option': `${props.ariaLabel}:${option.value}`, onClick: () => emit('update:modelValue', option.value) }, option.label),
    )),
})

const component = compileClientComponent(new URL('./JoinDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/NodeLabel.vue': moduleDefault(defineComponent({ props: { nodeId: String }, setup: (props) => () => h('span', props.nodeId) })),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ nodes: ref([{ nodeId: 'n3', kind: 'server', location: 'Giessen', reachable: true }]) }),
  },
  '@/composables/useSetChanges': { useSetChanges: () => ({ busy: ref(false), failure: ref(null), join }) },
  '@/lib/distributedMock': Mock,
  '@/lib/distribution': Distribution,
})

const bucket: Distribution.DistributedBucket = {
  name: 'spire',
  preset: 'mirror',
  members: [{ memberId: 'm1', nodeId: 'n1', state: 'ready', strategy: 'copy', coverage: 'all' }],
  ranges: [],
  live: {
    setId: 's1', groupId: 'g1', pending: false, serving: true, conflicted: false, changesUnavailable: false,
    recommendedGrant: '', transfers: [], deletion: null, publicationsClosed: false,
  },
}

async function render() {
  const { root } = await mountApp(component, { props: { open: true, bucket } })
  // The radio chooses the node the way the browser tells a change.
  const radio = element(root, (node) => node.tag === 'input' && node.props.name === 'join-node')
  for (const listener of radio.listeners.get('change') ?? []) listener({ target: radio })
  await flush()
  return root
}

describe('join dialog', () => {
  beforeEach(() => join.mockReset().mockResolvedValue(true))

  it('leaves the range behaviour to the bucket unless an option is chosen', async () => {
    const root = await render()
    await (button(root, 'Add node').props.onClick as () => Promise<void>)()

    expect(join).toHaveBeenCalledWith({ node_id: 'n3', coverage: 'all', strategy: 'copy' })
  })

  it('sends the range behaviour chosen in the advanced options', async () => {
    const root = await render()
    await (element(root, (node) => node.props['data-select-option'] === 'Range request behaviour of this node:fill first').props.onClick as () => void)()
    await flush()
    await (button(root, 'Add node').props.onClick as () => Promise<void>)()

    expect(join).toHaveBeenCalledWith({ node_id: 'n3', coverage: 'all', strategy: 'copy', range_behaviour: 'fill_first' })
  })
})
