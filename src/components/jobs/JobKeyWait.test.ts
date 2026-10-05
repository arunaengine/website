import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as Wording from '@/lib/bucketEncryption'
import { compileClientComponent, content, element, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const LinkStub = defineComponent({
  props: { to: Object },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})

const wait = compileClientComponent(new URL('./JobKeyWait.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/NodeLabel.vue': moduleDefault(defineComponent({ props: { nodeId: String }, setup: (props) => () => h('span', props.nodeId) })),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/lib/bucketEncryption': Wording,
})

describe('job waiting for a bucket key', () => {
  it('links every locked bucket to its Encryption tab on its own node', async () => {
    const { root } = await mountApp(wait, { props: { waits: [{ node_id: 'node-b', bucket: 'reef', group_id: 'g-1' }] } })
    const link = element(root, (node) => node.tag === 'a')

    expect(content(root)).toContain('neither fails nor')
    expect(content(root)).toContain('reef on node-b')
    expect(JSON.parse(String(link.props['data-to']))).toEqual({
      name: 'bucket-storage',
      params: { bucketId: 'reef' },
      query: { tab: 'encryption', node: 'node-b', group: 'g-1' },
    })
  })

  it('says so when the node named no bucket', async () => {
    const { root } = await mountApp(wait, { props: { waits: [] } })

    expect(content(root)).toContain('did not say which bucket')
  })
})
