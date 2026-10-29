import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import * as NodeDisplay from './node-display'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { RealmNodeInfo } from '@/lib/api'

const Empty = defineComponent(() => () => null)
// An editor with its own draft, as the real one keeps what was typed.
const EditStub = defineComponent({
  props: { name: String },
  setup: (props) => {
    const draft = ref('')
    return () => h('span', [h('button', { onClick: () => (draft.value = `draft of ${props.name}`) }, 'Type'), `draft: ${draft.value}`])
  },
})

const NodeDetailPanel = compileClientComponent(new URL('./NodeDetailPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(Empty),
  '@/components/ui/NodeLabel.vue': moduleDefault(Empty),
  './LocalNodeDetails.vue': moduleDefault(Empty),
  './NodeNameEdit.vue': moduleDefault(EditStub),
  './node-display': NodeDisplay,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
})

const node = (node_id: string, display_name: string): RealmNodeInfo =>
  ({ node_id, kind: 'server', configured: true, present: true, connection_status: 'connected', display_name, placement: null, info: null }) as RealmNodeInfo

describe('node details rename', () => {
  it('starts a fresh editor when the details switch to another node', async () => {
    const shown = ref(node('a', 'Node A'))
    const Host = defineComponent(() => () => h(NodeDetailPanel, { node: shown.value, rename: async () => {} }))
    const mounted = await mountApp(Host)

    await click(button(mounted.root, 'Type'))
    expect(content(mounted.root)).toContain('draft: draft of Node A')

    shown.value = node('b', 'Node B')
    await flush()
    expect(content(mounted.root)).not.toContain('draft of Node A')
    mounted.app.unmount()
  })
})
