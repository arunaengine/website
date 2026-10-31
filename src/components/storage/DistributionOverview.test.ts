import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Distribution from '@/lib/distribution'
import * as DistributedMock from '@/lib/distributedMock'
import * as FormatCount from '@/lib/formatCount'
import * as Utils from '@/lib/utils'
import type { DistributedBucket } from '@/lib/distribution'
import { compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'

const NODE_A = 'a'.repeat(64)
const NODE_B = 'b'.repeat(64)
const names: Record<string, string> = { [NODE_A]: 'Giessen storage 1', [NODE_B]: 'Giessen storage 2' }

const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { 'data-node': (props.to as { params: { nodeId: string } }).params.nodeId }, slots.default?.()),
})
const RowList = compileClientComponent(new URL('../distributed/RowList.vue', import.meta.url), { vue: VueRuntime })

const Overview = compileClientComponent(new URL('./DistributionOverview.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/distributed/MockNotice.vue': moduleDefault(defineComponent(() => () => null)),
  '@/components/distributed/RowList.vue': moduleDefault(RowList),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => names[id] ?? id }) },
  '@/lib/distributedMock': DistributedMock,
  '@/lib/distribution': Distribution,
  '@/lib/formatCount': FormatCount,
  '@/lib/utils': Utils,
})

describe('distribution overview', () => {
  it('names the nodes of a bucket on several nodes and links each one', async () => {
    const bucket = {
      name: 'bakrep',
      preset: 'sharding',
      members: [{ nodeId: NODE_A }, { nodeId: NODE_B }],
      ranges: [],
      live: { pending: false, deletion: null },
    } as unknown as DistributedBucket
    const { root } = await mountApp(Overview, { props: { bucket } })

    expect(content(root)).toContain('Split across 2 nodes: Giessen storage 1, Giessen storage 2')
    expect(content(root)).not.toContain(NODE_A)
    expect(element(root, (node) => node.props['data-node'] === NODE_B).tag).toBe('a')
  })
})
