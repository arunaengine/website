import { computed, createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStatus, type NodeStatus } from '@/lib/desktopBridge'

const status = ref<NodeStatus | null>(null)
const s3Url = ref<string | null>(null)
const mcpUrl = ref<string | null>(null)
const compute = ref<{ enabled: boolean } | null>(null)
const computeShown = ref(true)
const credentials = ref<Array<{ access_key_id: string; status: string; expires_at: string }>>([])
const keysState = ref('ready')
const keysAvailable = ref(true)

const passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
const CopyStub = defineComponent({
  props: { value: { type: String, default: '' } },
  setup: (props) => () => h('i', { 'data-copy': props.value }),
})

let ToolsView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: RouterLinkStub }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/ui/CopyButton.vue', () => ({ default: CopyStub }))
  vi.doMock('@/components/ui/Tabs.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/ui/TabsList.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/ui/TabsTrigger.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/ui/TabsContent.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/desktop/CreateKeyDialog.vue', () => ({ default: defineComponent(() => () => null) }))
  vi.doMock('@/composables/useDeviceKeys', () => ({
    useDeviceKeys: () => ({
      active: computed(() => credentials.value.filter((key) => key.status === 'active')),
      state: keysState,
      available: keysAvailable,
      remove: vi.fn(),
    }),
  }))
  vi.doMock('@/composables/usePortalFeatures', () => ({
    usePortalFeatures: () => ({ shown: () => computeShown.value }),
  }))
  vi.doMock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ status, s3Url, mcpUrl, deviceClient: ref(null) }) }))
  vi.doMock('@/composables/useDeviceCompute', () => ({
    useDeviceCompute: () => ({ compute, ensureLoaded: vi.fn(async () => undefined) }),
  }))
  vi.doMock('@/composables/useNodeControl', () => ({
    useNodeControl: () => ({ busy: ref(false), error: ref(null), start: vi.fn() }),
  }))
  ToolsView = (await import('./ToolsView.vue')).default
})

beforeEach(() => {
  status.value = readStatus({
    state: 'running',
    ready: true,
    enrolled: true,
    apiBaseUrl: 'http://127.0.0.1:9000/api/v1',
  })
  s3Url.value = 'http://127.0.0.1:9100'
  mcpUrl.value = 'http://127.0.0.1:9000/mcp'
  compute.value = { enabled: true }
  computeShown.value = true
  credentials.value = []
  keysState.value = 'ready'
  keysAvailable.value = true
})

const render = () => renderToString(createSSRApp(ToolsView))

describe('connect your tools', () => {
  it('shows the address the node reported and puts it into the lines', async () => {
    const html = await render()

    expect(html).toContain('Address of this computer')
    expect(html).toContain('http://127.0.0.1:9100')
    expect(html).toContain('--endpoint-url http://127.0.0.1:9100')
    expect(html).toContain('Create a key first to fill in your own values.')
  })

  it('reads the ports from the node, never from the page', async () => {
    s3Url.value = 'http://127.0.0.1:41000'
    status.value = readStatus({ state: 'running', ready: true, apiBaseUrl: 'http://127.0.0.1:41001/api/v1' })
    const html = await render()

    expect(html).toContain('http://127.0.0.1:41000')
    expect(html).toContain('tes.endpoint = &#39;http://127.0.0.1:41001/api/v1/ga4gh/tes/v1&#39;')
    expect(html).not.toContain('34118')
    expect(html).not.toContain('34116')
  })

  it('shows no address and greys the lines while the node is not running', async () => {
    status.value = readStatus({ state: 'stopped' })
    const html = await render()

    expect(html).toContain('Not running')
    expect(html).toContain('Start Aruna to get an address.')
    expect(html).toContain('opacity-50')
    expect(html).not.toContain('http://127.0.0.1')
    expect(html).toContain('ADDRESS_OF_THIS_COMPUTER')
  })

  it('lists active keys by the name this app remembers and hides inactive ones', async () => {
    credentials.value = [
      { access_key_id: 'ARKACTIVE', status: 'active', expires_at: '2027-10-12T00:00:00Z' },
      { access_key_id: 'ARKGONE', status: 'revoked', expires_at: '2027-10-12T00:00:00Z' },
    ]
    const html = await render()

    expect(html).toContain('ARKACTIVE')
    expect(html).not.toContain('ARKGONE')
    expect(html).toContain('Remove')
    expect(html).not.toContain('You have no key yet.')
  })

  it('says nothing about keys it could not read and blocks making one', async () => {
    keysState.value = 'offline'
    keysAvailable.value = false
    const html = await render()

    expect(html).toContain('Aruna cannot list your keys right now.')
    expect(html).not.toContain('You have no key yet.')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]+>)*[^<]*Create key/)
  })

  it('says there is no key instead of inventing one', async () => {
    expect(await render()).toContain('You have no key yet.')
  })

  it('keeps the Nextflow lines against the local job address and says local runs are needed', async () => {
    compute.value = { enabled: false }
    const html = await render()

    expect(html).toContain('process.executor = &#39;tes&#39;')
    expect(html).toContain('tes.endpoint = &#39;http://127.0.0.1:9000/api/v1/ga4gh/tes/v1&#39;')
    expect(html).toContain('Local runs off')
    expect(html).toContain('Needs local runs.')
  })

  it('leaves the job card out while compute is switched off', async () => {
    computeShown.value = false

    expect(await render()).not.toContain('Run jobs with TES')
  })

  it('names the placeholder when the node reports no AI address', async () => {
    mcpUrl.value = null

    expect(await render()).toContain('Aruna reports no address for AI assistants')
  })
})
