import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const Slotted = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const listed = (bucket: string, node: string) => ({ arn: `${node}/${bucket}`, bucket, node_id: node, group_id: 'g1', created_at: '', nodes: [node] })

const component = compileClientComponent(new URL('./BucketSearchBox.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/data/BucketRow.vue': moduleDefault(defineComponent({ props: { bucket: String }, setup: (props) => () => h('span', props.bucket) })),
  '@/components/ui/NodeLabel.vue': moduleDefault(Empty),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/composables/useBucketSearch': {
    MIN_CHARS: 2,
    useBucketSearch: () => ({
      hits: ref([listed('results', 'node-2'), listed('laptop-notes', 'device-1')]),
      raw: ref([]),
      nodesQueried: ref(3),
      nodesFailed: ref(0),
      searching: ref(false),
      searched: ref(true),
      error: ref(null),
    }),
  },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ displayName: (id: string) => id, isLocalNode: () => false, isTarget: (id: string) => id !== 'device-1', localNodeId: ref('node-1') }),
  },
  '@/composables/useBucketShortcuts': { useBucketShortcuts: () => ({ isPinned: () => false, togglePin: () => {} }) },
  '@/lib/sync': { syncBucketKey: () => '' },
  '@/lib/workspaces': { isHiddenBucket: () => false },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
})

describe('bucket search box', () => {
  it('offers no bucket a device answers for', async () => {
    const { root } = await mountApp(component, { props: { modelValue: 'res', mode: 'picker' } })
    ;(element(root, (node) => node.tag === 'input').props.onFocus as () => void)()
    await flush()

    expect(content(root)).toContain('results')
    expect(content(root)).not.toContain('laptop-notes')
  })
})
