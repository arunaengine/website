import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Distribution from '@/lib/distribution'
import { button, compileClientComponent, content, flush, mountApp, moduleDefault, nodes, element } from '@/test/clientRender'

const transfer = vi.fn()
const failure = ref<string | null>(null)

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', { 'data-select': props.ariaLabel }, (props.options as Array<{ value: string; label: string }>).map((option) =>
      h('button', { 'data-option': option.value, onClick: () => emit('update:modelValue', option.value) }, option.label),
    )),
})

const component = compileClientComponent(new URL('./TransferDialog.vue', import.meta.url), {
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
  '@/components/ui/OptionToggle.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
  '@/composables/useSetChanges': { useSetChanges: () => ({ busy: ref(false), failure, transfer }) },
  '@/lib/distributedMock': { stamp: (value: string) => value },
  '@/lib/distribution': Distribution,
})

const member = (memberId: string, nodeId: string, state: 'ready' | 'catching up' = 'ready') =>
  ({ memberId, nodeId, state, strategy: 'copy' as const, coverage: 'all' as const })

function bucket(extra: Partial<Distribution.DistributedBucket['ranges'][number]> = {}): Distribution.DistributedBucket {
  return {
    name: 'spire',
    preset: 'mirror',
    members: [member('m1', 'n1'), member('m2', 'n2'), member('m3', 'n3', 'catching up'), member('m4', 'n4')],
    ranges: [{ id: 'r1', lower: '', upper: '', coordinator: 'n1', coordinatorId: 'm1', replicas: ['n2', 'n3'], replicaIds: ['m2', 'm3'], epoch: 1, ...extra }],
    live: {
      setId: 's1', groupId: 'g1', pending: false, serving: true, conflicted: false, changesUnavailable: false,
      recommendedGrant: '', transfers: [], deletion: null, publicationsClosed: false,
    },
  }
}

async function render(data = bucket()) {
  const updates: unknown[] = []
  const { root } = await mountApp(component, { props: { open: true, bucket: data, onChanged: () => updates.push('changed') } })
  return { root, updates }
}

describe('transfer dialog', () => {
  beforeEach(() => {
    transfer.mockReset().mockResolvedValue(true)
    failure.value = null
  })

  it('offers only a ready copy of the range and says why the others are not offered', async () => {
    const { root } = await render()
    const offered = nodes(root).map((node) => node.props['data-option']).filter(Boolean)

    expect(offered.filter((value) => ['m2', 'm3', 'm4'].includes(String(value)))).toEqual(['m2'])
    expect(content(root)).toContain('Is catching up, not ready')
    expect(content(root)).toContain('Keeps no copy of this range')
  })

  it('opens the move for the chosen member and reports the change', async () => {
    const { root, updates } = await render()
    await (element(root, (node) => node.props['data-option'] === 'm2').props.onClick as () => void)()
    await flush()
    await (button(root, 'Start the move').props.onClick as () => Promise<void>)()
    await flush()

    expect(transfer).toHaveBeenCalledWith({ range_id: 'r1', to: 'm2', role: 'replica' })
    expect(updates).toEqual(['changed'])
  })

  it('blocks the move while the coordinator is unreachable', async () => {
    const { root } = await render(bucket({ degraded: true }))

    expect(content(root)).toContain('must stop writes before another node can take over')
    expect(button(root, 'Start the move').props.disabled).toBe(true)
  })
})
