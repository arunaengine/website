import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as NodeDisplay from './node-display'
import * as Storage from '@/lib/storage'
import * as Utils from '@/lib/utils'
import type { InfoResponse } from '@/lib/api'
import { compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const CopyStub = defineComponent({
  props: { value: { type: String, default: '' }, label: { type: String, default: '' } },
  setup: (props) => () => h('button', { 'data-copy': props.value, 'aria-label': props.label }),
})

const details = compileClientComponent(new URL('./LocalNodeDetails.vue', import.meta.url), {
  vue: VueRuntime,
  './node-display': NodeDisplay,
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/CopyButton.vue': moduleDefault(CopyStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/QuotaBar.vue': moduleDefault(Slotted('div')),
  '@/lib/storage': Storage,
  '@/lib/utils': Utils,
})

function info(restUrl?: string): InfoResponse {
  return {
    node: { status: 'ok', realm_id: 'r', peer_id: 'p', capabilities: 'server' },
    my_addresses: [],
    services: {
      interfaces: {
        rest: { status: 'ok', url: restUrl, bind: '0.0.0.0:8080' },
        s3: { status: 'ok', url: 'https://s3.example.org', bind: '0.0.0.0:9000' },
      },
    },
    warnings: [],
  } as InfoResponse
}

describe('node interfaces', () => {
  it('lists OAI-PMH under the REST base with copy and Identify', async () => {
    const { root } = await mountApp(details, { props: { info: info('https://api.example.org/') } })
    const row = element(root, (node) => node.tag === 'li' && content(node).includes('OAI-PMH'))

    expect(content(row)).toContain('https://api.example.org/oai')
    expect(element(row, (node) => node.props['data-copy'] !== undefined).props['data-copy']).toBe('https://api.example.org/oai')
    expect(element(row, (node) => node.tag === 'a').props.href).toBe('https://api.example.org/oai?verb=Identify')
    expect(content(root)).toContain('OAI-PMH lets other services collect the metadata of public datasets.')
  })

  it('offers no copy or link without a REST url', async () => {
    const { root } = await mountApp(details, { props: { info: info() } })
    const row = element(root, (node) => node.tag === 'li' && content(node).includes('OAI-PMH'))

    expect(content(row)).toContain('-')
    expect(nodes(row).some((node) => node.tag === 'a')).toBe(false)
  })
})
