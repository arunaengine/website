import * as VueRuntime from 'vue'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import * as NodeDisplay from '@/components/nodes/node-display'
import { compileClientComponent, element, mountApp } from '@/test/clientRender'
import RealmTopology from './RealmTopology.vue'

const realmNode = (node_id: string, kind: string, display_name: string, extra: Record<string, unknown> = {}) =>
  ({ node_id, kind, display_name, configured: true, present: true, connection_status: 'connected', place: 'Giessen', ...extra })
const nodes = [
  realmNode('aaaa-mgmt', 'management', 'Giessen management'),
  realmNode('bbbb-store', 'server', 'Giessen storage 1', { info: { utilization: { imports_running: 1 } } }),
  realmNode('cccc-store', 'server', 'Giessen storage 2', { present: false, connection_status: 'unknown' }),
]
const render = (props: Record<string, unknown>) => renderToString(createSSRApp({ render: () => h(RealmTopology as never, props) }))

describe('realm topology', () => {
  it('names each node and its type, colours rings by kind and arcs only an importing node', async () => {
    const html = await render({ nodes, localPeerId: 'aaaa-mgmt' })

    for (const text of ['Giessen management', 'Management', 'Giessen storage 1', 'Storage']) expect(html).toMatch(new RegExp(`>\\s*${text}\\s*</text>`))
    expect(html).toContain('stroke="#24A9E6" stroke-width="2"')
    expect(html.match(/stroke="#55C4DE" stroke-width="2.5"/g)).toHaveLength(1)
    // The hub's own view: one connected edge, one quiet dashed edge to the node it lost.
    expect(html.match(/stroke="#10b981" stroke-opacity="0.7"/g)).toHaveLength(2)
    expect(html).toContain('stroke-dasharray="3 6"')
    expect(html).toContain('All nodes are in Giessen')
    expect(html).toContain('Connected')
    expect(html).not.toContain('Device link')
  })

  it('counts places when the nodes stand apart', async () => {
    const html = await render({ nodes: [nodes[0], { ...nodes[1], place: 'Marburg' }], localPeerId: 'aaaa-mgmt' })
    expect(html).toContain('2 places')
  })

  it('puts this computer below with a dashed link to each realm node it is connected to', async () => {
    const html = await render({ nodes, localPeerId: 'aaaa-mgmt', computer: { id: 'laptop', name: 'Microbiology laptop', peers: ['aaaa-mgmt'] } })

    expect(html).toMatch(/>\s*Microbiology laptop\s*<\/text>/)
    expect(html).toMatch(/>\s*Device, this computer\s*<\/text>/)
    expect(html.match(/stroke-dasharray="5 5"/g)).toHaveLength(1)
    expect(html).toContain('Device link')

    const away = await render({ nodes, localPeerId: 'aaaa-mgmt', computer: { id: 'laptop', name: 'This computer', peers: [] } })
    expect(away).toMatch(/>\s*Device, not connected\s*<\/text>/)
  })

  it('opens a node, reports the hovered one and lights up the one the table hovers', async () => {
    const Client = compileClientComponent(new URL('./RealmTopology.vue', import.meta.url), {
      vue: VueRuntime,
      '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
      '@/components/nodes/node-display': NodeDisplay,
      '@/composables/useRealmNodes': { THIS_COMPUTER: 'This computer' },
      '@vueuse/core': { useElementSize: () => ({ width: { value: 0 }, height: { value: 0 } }) },
    })
    const onSelect = vi.fn()
    const onHover = vi.fn()
    const mounted = await mountApp(Client, { props: { nodes, localPeerId: 'aaaa-mgmt', highlight: 'bbbb-store', onSelect, onHover } })
    const spot = (id: string) => element(mounted.root, (node) => node.props['data-node'] === id)

    ;(spot('cccc-store').props.onClick as () => void)()
    expect(onSelect).toHaveBeenCalledWith('cccc-store')
    ;(spot('cccc-store').props.onMouseenter as () => void)()
    expect(onHover).toHaveBeenLastCalledWith('cccc-store')
    expect(spot('bbbb-store').children.find((node) => node.tag === 'circle')?.props.opacity).toBe(0.6)
    expect(spot('cccc-store').children.find((node) => node.tag === 'circle')?.props.opacity).toBe(0)
    mounted.app.unmount()
  })
})
