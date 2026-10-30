import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as Distribution from '@/lib/distribution'
import { compileClientComponent, content, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Hidden = defineComponent(() => () => null)

const component = compileClientComponent(new URL('./BucketActions.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Hidden }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/InfoHint.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (props) => () => h('i', { 'data-hint': props.label }) })),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/distributed/JoinDialog.vue': moduleDefault(Hidden),
  '@/components/distributed/LeaveDialog.vue': moduleDefault(Hidden),
  '@/components/distributed/SettingsDialog.vue': moduleDefault(Hidden),
  '@/components/distributed/TransferDialog.vue': moduleDefault(Hidden),
  '@/lib/distribution': Distribution,
})

const member = (memberId: string, nodeId: string): Distribution.DistributedMember => ({ memberId, nodeId, state: 'ready', strategy: 'copy', coverage: 'assigned' })
const bucket = (replicaIds: string[]): Distribution.DistributedBucket => ({
  name: 'bakrep',
  preset: 'mirror',
  members: [member('m1', 'node-1'), member('m2', 'node-2')],
  ranges: [{ id: 'r1', lower: '', upper: '', coordinator: 'node-1', coordinatorId: 'm1', epoch: 1, replicas: [], replicaIds }],
})
const moveButton = (root: Parameters<typeof content>[0]) => nodes(root).find((node) => node.tag === 'button' && content(node).includes('Move a range'))!

describe('bucket actions', () => {
  it('disables Move a range and says why while no other member holds a copy of a range', async () => {
    const { root } = await mountApp(component, { props: { bucket: bucket([]), admin: true } })

    expect(moveButton(root).props.disabled).toBe(true)
    expect(nodes(root).find((node) => node.props['data-hint'])?.props['data-hint']).toBe('No other member holds a copy of a range yet, so no range can move.')
  })

  it('offers Move a range once another member holds a ready copy', async () => {
    const { root } = await mountApp(component, { props: { bucket: bucket(['m2']), admin: true } })

    expect(moveButton(root).props.disabled).toBe(false)
    expect(nodes(root).some((node) => node.props['data-hint'])).toBe(false)
  })
})
