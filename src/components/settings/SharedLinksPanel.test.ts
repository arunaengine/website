import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as ShareLinks from '@/lib/shareLinks'
import { isUnsupportedEndpoint } from '@/composables/aruna/connectors'
import { formatDateTime } from '@/lib/utils'

const BASES: Record<string, string> = { local: 'https://local.test/api/v1', remote: 'https://remote.test/api/v1', down: 'https://down.test/api/v1' }
let routes: Record<string, () => Response> = {}
let sent: Array<{ url: string; method: string }> = []
const copied: string[] = []

function share(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    target: { kind: 'folder', bucket: 'data', prefix: 'results/' },
    mode: 'read',
    label: '',
    created_at: '2026-10-30T09:00:00Z',
    expires_at: null,
    password: false,
    revoked_at: null,
    status: 'active',
    downloads: 0,
    uploads: 0,
    last_access_at: null,
    ...overrides,
  }
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status })

const aruna = {
  currentUser: ref<Record<string, unknown> | null>({ id: 'u1' }),
  nodeInfo: ref({ node: { peer_id: 'local' } }),
  realmInfo: ref({
    nodes: [
      { node_id: 'local', kind: 'server', info: { urls: { api: BASES.local } } },
      { node_id: 'remote', kind: 'server', info: { urls: { api: BASES.remote } } },
      { node_id: 'down', kind: 'server', info: { urls: { api: BASES.down } } },
      { node_id: 'phone', kind: 'user', info: { urls: { api: 'https://phone.test' } } },
    ],
  }),
}

const Pass = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()) })
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })

const SharedLinksPanel = compileClientComponent(new URL('./SharedLinksPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Pass),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Pass),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Pass),
  '@/components/ui/ListPager.vue': moduleDefault(defineComponent({ props: { total: Number }, setup: (props) => () => h('nav', `pager of ${props.total}`) })),
  '@/components/ui/Notice.vue': moduleDefault(Pass),
  '@/components/ui/RefusalNote.vue': moduleDefault(defineComponent({ props: { message: String }, setup: (props) => () => h('p', props.message) })),
  '@/components/ui/SectionHeading.vue': moduleDefault(Pass),
  '@/components/settings/ShareLogDialog.vue': moduleDefault(defineComponent({ props: { open: Boolean, share: Object }, setup: (props) => () => h('aside', props.open ? `log of ${(props.share as { id: string }).id}` : '') })),
  '@/components/nodes/node-probe': { nodeApiBase: (node: { info?: { urls?: { api?: string } } }) => node.info?.urls?.api ?? null },
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useShareLinks': {
    shareClient: async (nodeId: string | null) => ({ baseUrl: BASES[nodeId ?? 'local'], token: 'bearer' }),
    linkFor: async (id: string, nodeId: string | null) => `https://portal.test/s/${nodeId ?? 'local'}#${id}.secret`,
    shareErrorMessage: (cause: unknown) => String(cause),
  },
  '@/composables/aruna/connectors': { isUnsupportedEndpoint },
  '@/lib/api': Api,
  '@/lib/shareLinks': ShareLinks,
  '@/lib/utils': { copyToClipboard: async (text: string) => void copied.push(text), formatDateTime },
})

beforeEach(() => {
  sent = []
  copied.length = 0
  routes = {
    'GET https://local.test/api/v1/shares': json({ shares: [share('L1', { downloads: 2 })] }),
    'GET https://remote.test/api/v1/shares': json({ shares: [share('R1', { created_at: '2026-10-31T09:00:00Z', target: { kind: 'bucket', bucket: 'reef' }, password: true, uploads: 1, last_access_at: '2026-10-31T10:00:00Z' })] }),
    'GET https://down.test/api/v1/shares': json({ error: 'down' }, 503),
    'DELETE https://remote.test/api/v1/shares/R1': () => new Response(null, { status: 204 }),
  }
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    const key = `${init.method ?? 'GET'} ${String(input)}`
    sent.push({ url: String(input), method: init.method ?? 'GET' })
    return (routes[key] ?? json({ error: `no route ${key}` }, 500))()
  }))
})

afterEach(() => vi.unstubAllGlobals())

const rowOf = (root: Parameters<typeof content>[0], text: string) => element(root, (node) => node.tag === 'tr' && content(node).includes(text))

describe('SharedLinksPanel', () => {
  it('merges the links of every realm node, newest first, and names a node that did not answer', async () => {
    const { root } = await mountApp(SharedLinksPanel)
    await vi.waitFor(() => expect(content(root)).toContain('reef'))
    await flush()

    const rows = nodes(root).filter((node) => node.tag === 'tr' && content(node).includes('Read only'))
    expect(rows.map((row) => content(row))).toEqual([expect.stringContaining('reef'), expect.stringContaining('data/results/')])
    expect(content(root)).toContain('1 node did not answer')
    expect(sent.some((entry) => entry.url.startsWith('https://phone.test'))).toBe(false)
    expect(content(rowOf(root, 'reef'))).toMatch(new RegExp(`Yes\\s*0\\s*1\\s*${formatDateTime('2026-10-31T10:00:00Z')}\\s*Active`))
    expect(content(rowOf(root, 'data/results/'))).toMatch(/No\s*2\s*0\s*Never\s*Active/)
    expect(sent.some((entry) => entry.url.includes('/log'))).toBe(false)
  })

  it('copies and revokes a link on the node that holds it, and opens its log', async () => {
    const { root } = await mountApp(SharedLinksPanel)
    await vi.waitFor(() => expect(content(root)).toContain('reef'))
    const row = rowOf(root, 'reef')

    await (element(row, (node) => node.props['aria-label'] === 'Copy link').props.onClick as () => Promise<void>)()
    expect(copied).toEqual(['https://portal.test/s/remote#R1.secret'])

    await (element(row, (node) => node.tag === 'button' && content(node) === 'Access log').props.onClick as () => void)()
    await flush()
    expect(content(root)).toContain('log of R1')

    await (element(row, (node) => node.tag === 'button' && content(node) === 'Revoke').props.onClick as () => Promise<void>)()
    await flush()
    expect(sent.at(-1)).toEqual({ url: 'https://remote.test/api/v1/shares/R1', method: 'DELETE' })
    expect(content(rowOf(root, 'reef'))).toContain('Revoked')
  })

  it('asks the other nodes once the realm names them', async () => {
    const nodesBefore = aruna.realmInfo.value.nodes
    aruna.realmInfo.value = { nodes: [] }
    try {
      const { root } = await mountApp(SharedLinksPanel)
      await vi.waitFor(() => expect(content(root)).toContain('data/results/'))
      expect(content(root)).not.toContain('reef')

      aruna.realmInfo.value = { nodes: nodesBefore }
      await vi.waitFor(() => expect(content(root)).toContain('reef'))
    } finally {
      aruna.realmInfo.value = { nodes: nodesBefore }
    }
  })
})
