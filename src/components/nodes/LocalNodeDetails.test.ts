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

const HintStub = defineComponent({ props: { label: { type: String, default: '' } }, setup: (props) => () => h('button', { 'data-hint': props.label }) })
const icons = Object.fromEntries(['CircleCheck', 'Database', 'ExternalLink', 'HardDrive', 'Network', 'Tag', 'TriangleAlert', 'Users'].map((name) => [name, Slotted('i')]))

const details = compileClientComponent(new URL('./LocalNodeDetails.vue', import.meta.url), {
  vue: VueRuntime,
  './node-display': NodeDisplay,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(Slotted('span')),
  '@/components/ui/DetailList.vue': moduleDefault(defineComponent({
    props: { items: { type: Array, default: () => [] } },
    setup: (props) => () => h('dl', (props.items as { label: string; value: string }[]).map((item) => h('div', [h('dt', item.label), h('dd', item.value)]))),
  })),
  '@/components/ui/InfoHint.vue': moduleDefault(HintStub),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({
    displayName: (id: string) => (id === 'a'.repeat(64) ? 'Giessen storage' : `${id.slice(0, 8)}…`),
    nodeById: (id: string | null) => (id === 'b'.repeat(64) ? { kind: 'user' } : id ? { kind: 'server' } : null),
  }) },
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
    expect(element(root, (node) => node.props['data-hint'] !== undefined).props['data-hint']).toBe('OAI-PMH lets other services collect the metadata of public datasets.')
  })

  it('offers no copy or link without a REST url', async () => {
    const { root } = await mountApp(details, { props: { info: info() } })
    const row = element(root, (node) => node.tag === 'li' && content(node).includes('OAI-PMH'))

    expect(content(row)).toContain('-')
    expect(nodes(row).some((node) => node.tag === 'a')).toBe(false)
  })

  it('shows the addresses a server published before its own, and its listen address only as a fallback', async () => {
    const published = await mountApp(details, { props: { info: info('http://127.0.0.1:8080/api/v1'), publicApi: 'https://api.node-2.example.org/api/v1', publicS3: 'https://s3.node-2.example.org' } })
    const text = content(published.root)
    expect(text).toContain('https://api.node-2.example.org/api/v1')
    expect(text).toContain('https://s3.node-2.example.org')
    expect(text).toContain('https://api.node-2.example.org/api/v1/oai')
    expect(text).not.toContain('127.0.0.1')
    published.app.unmount()

    const bare = await mountApp(details, { props: { info: info() } })
    expect(content(element(bare.root, (node) => node.tag === 'li' && content(node).includes('REST')))).toContain('0.0.0.0:8080')
    bare.app.unmount()
  })

  it('calls the addresses of a device local, names the realm API and leaves OAI-PMH out', async () => {
    const { root } = await mountApp(details, {
      props: { info: info('http://127.0.0.1:34116/api/v1'), device: true, realmApi: 'https://api.mgmt.example.org/api/v1' },
    })
    const text = content(root)

    expect(text).toContain('Local addresses')
    expect(element(root, (node) => node.props['data-hint'] !== undefined).props['data-hint']).toBe('Tools on this computer can connect here.')
    expect(text).toContain('http://127.0.0.1:34116/api/v1')
    expect(content(element(root, (node) => node.tag === 'li' && content(node).includes('Realm API')))).toContain('https://api.mgmt.example.org/api/v1')
    expect(text).not.toContain('OAI-PMH')
    expect(text).not.toContain('Interfaces')
  })

  it('says nothing about a working interface and one plain word about one that is not', async () => {
    const working = info('https://api.example.org/api/v1')
    working.services.interfaces.rest.status = 'available'
    working.services.interfaces.s3.status = 'not_configured'
    const { root } = await mountApp(details, { props: { info: working } })
    const row = (label: string) => content(element(root, (node) => node.tag === 'li' && content(node).startsWith(label)))

    expect(row('REST')).not.toMatch(/available/i)
    expect(row('S3')).toContain('not configured')
    expect(content(root)).not.toContain('AVAILABLE')
  })

  it('names a storage backend only when it has a problem, and never next to a pill', async () => {
    const backends = info('https://api.example.org/api/v1')
    backends.services.blob = {
      status: 'ok',
      backends: [
        { name: 'fast', backend: 's3', allow_tenants: false, default: true, status: 'ok' },
        { name: 'cold', backend: 'filesystem', allow_tenants: false, default: false, status: 'degraded' },
      ],
    }
    const { root } = await mountApp(details, { props: { info: backends } })
    const row = (name: string) => element(root, (node) => node.tag === 'li' && content(node).startsWith(name))
    const saying = (name: string, word: string) => nodes(row(name)).filter((node) => node.kind === 'element' && content(node).trim().toLowerCase() === word)

    expect(saying('fast', 'ok')).toHaveLength(0)
    const [degraded, ...more] = saying('cold', 'degraded')
    expect(more).toHaveLength(0)
    // A plain word, not a pill.
    expect(String(degraded.props.class)).not.toContain('uppercase')
  })

  it('names an unreachable peer by its node and keeps the raw warning behind a hint', async () => {
    const warned = info('https://api.example.org/api/v1')
    const raw = `managed peer ${'a'.repeat(64)} unreachable: DHT error: timeout`
    warned.warnings = [raw]
    const { root } = await mountApp(details, { props: { info: warned } })

    expect(content(root)).toContain('Giessen storage is unreachable')
    expect(content(root)).not.toContain('a'.repeat(64))
    expect(nodes(root).some((node) => node.props['data-hint'] === raw)).toBe(true)
  })

  it('warns about no device, as devices are often offline', async () => {
    const warned = info('https://api.example.org/api/v1')
    warned.warnings = [`managed peer ${'b'.repeat(64)} unreachable: DHT error: timeout`]
    const { root } = await mountApp(details, { props: { info: warned } })

    expect(content(root)).not.toContain('Warnings')
    expect(content(root)).not.toContain('unreachable')
  })
})
