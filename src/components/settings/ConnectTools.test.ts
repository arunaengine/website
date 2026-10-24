import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ToolSnippets from '@/lib/toolSnippets'
import * as Utils from '@/lib/utils'
import { readStatus, type NodeStatus } from '@/lib/desktopBridge'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, type HostNode } from '@/test/clientRender'

const status = ref<NodeStatus | null>(null)
const s3Url = ref<string | null>(null)
const mcpUrl = ref<string | null>(null)
const deviceKeyList = ref<Array<{ access_key_id: string; status: string; expires_at: string }>>([])
const keysState = ref('ready')
const query = ref<Record<string, string>>({})
const realmNodes = ref<Array<Record<string, unknown>>>([])
const listKeys = vi.fn()
const revokeKey = vi.fn()
const createKey = vi.fn()
const removeDeviceKey = vi.fn()
const dialogs = { create: undefined as undefined | ((group: string, seconds: number) => Promise<unknown>) }

const Plain = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()),
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
// The place and program switches: one button per trigger, the chosen one's content shown.
const tabsValue = Symbol('tabs')
const TabsStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    VueRuntime.provide(tabsValue, { current: () => props.modelValue, pick: (value: string) => emit('update:modelValue', value) })
    return () => h('div', slots.default?.())
  },
})
const TriggerStub = defineComponent({
  props: { value: String },
  setup(props, { slots }) {
    const tabs = VueRuntime.inject(tabsValue) as { pick: (value: string) => void }
    return () => h('button', { 'data-tab': props.value, onClick: () => tabs.pick(props.value!) }, slots.default?.())
  },
})
const ContentStub = defineComponent({
  props: { value: String },
  setup(props, { slots }) {
    const tabs = VueRuntime.inject(tabsValue) as { current: () => string }
    return () => (tabs.current() === props.value ? h('div', slots.default?.()) : null)
  },
})
const CopyStub = defineComponent({ props: { value: String }, setup: (props) => () => h('i', { 'data-copy': props.value }) })
const KeyDialogStub = defineComponent({
  props: { open: Boolean, create: Function },
  setup(props) {
    return () => {
      dialogs.create = props.create as typeof dialogs.create
      return h('div', props.open ? 'key-dialog-open' : '')
    }
  },
})

const ConnectTools = compileClientComponent(new URL('./ConnectTools.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Plain, useRoute: () => ({ query: query.value }) },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(CopyStub),
  '@/components/ui/Notice.vue': moduleDefault(Plain),
  '@/components/ui/Tabs.vue': moduleDefault(TabsStub),
  '@/components/ui/TabsContent.vue': moduleDefault(ContentStub),
  '@/components/ui/TabsList.vue': moduleDefault(Plain),
  '@/components/ui/TabsTrigger.vue': moduleDefault(TriggerStub),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(Plain),
  '@/components/desktop/CreateKeyDialog.vue': moduleDefault(KeyDialogStub),
  '@/composables/useAruna': {
    useAruna: () => ({ authToken: ref('token'), realmInfo: ref({ interfaces: { mcp: { url: 'https://realm.example/mcp' } } }) }),
  },
  '@/composables/useDeviceKeys': {
    useDeviceKeys: () => ({
      active: computed(() => deviceKeyList.value.filter((key) => key.status === 'active')),
      state: keysState,
      available: computed(() => keysState.value === 'ready'),
      remove: removeDeviceKey,
    }),
  },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ status, s3Url, mcpUrl, deviceClient: ref(null) }) },
  '@/composables/useNodeControl': { useNodeControl: () => ({ busy: ref(false), error: ref(null), start: vi.fn() }) },
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: () => true }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ nodes: realmNodes }) },
  '@/lib/deviceApi': {
    listDeviceCredentials: listKeys,
    revokeDeviceCredential: revokeKey,
    createDeviceCredential: createKey,
  },
  '@/lib/keyNames': { keyNames: () => ({ ARKLOCAL: 'Laptop tools', ARKNODE: 'Lab server backup' }) },
  '@/lib/toolSnippets': ToolSnippets,
  '@/lib/utils': Utils,
})

const node1 = {
  nodeId: 'node-1-id',
  kind: 'server',
  label: 'node-1 · Giessen',
  title: 'server node-1…',
  s3Url: 'https://s3.node-1.example',
  apiBase: 'https://node-1.example/api/v1',
  reachable: true,
}

function keyRow(root: HostNode, name: string): HostNode {
  return element(root, (node) => node.tag === 'li' && content(node).includes(name))
}

function tab(root: HostNode, value: string): HostNode {
  return element(root, (node) => node.tag === 'button' && node.props['data-tab'] === value)
}

beforeEach(() => {
  status.value = readStatus({ state: 'running', ready: true, enrolled: true, apiBaseUrl: 'http://127.0.0.1:9000/api/v1' })
  s3Url.value = 'http://127.0.0.1:9100'
  mcpUrl.value = 'http://127.0.0.1:9000/mcp'
  deviceKeyList.value = [{ access_key_id: 'ARKLOCAL', status: 'active', expires_at: '2027-10-12T00:00:00Z' }]
  keysState.value = 'ready'
  query.value = {}
  realmNodes.value = [node1]
  listKeys.mockReset().mockResolvedValue([
    { access_key_id: 'ARKNODE', status: 'active', expires_at: '2027-10-12T00:00:00Z' },
    { access_key_id: 'ARKREVOKED', status: 'revoked', expires_at: '2027-10-12T00:00:00Z' },
  ])
  revokeKey.mockReset().mockResolvedValue(undefined)
  createKey.mockReset().mockResolvedValue({ access_key_id: 'ARKNEW', access_secret: 's' })
  removeDeviceKey.mockReset().mockResolvedValue(undefined)
})

describe('connect your tools in the desktop settings', () => {
  it('lists the keys of every place in one list with their place', async () => {
    const mounted = await mountApp(ConnectTools)
    await flush()

    expect(listKeys).toHaveBeenCalledWith({ baseUrl: 'https://node-1.example/api/v1', token: 'token' })
    expect(content(keyRow(mounted.root, 'Laptop tools'))).toContain('This computer')
    expect(content(keyRow(mounted.root, 'Lab server backup'))).toContain('node-1 · Giessen')
    expect(content(mounted.root)).not.toContain('ARKREVOKED')
    mounted.app.unmount()
  })

  it('switches the address and the lines between this computer and a realm node', async () => {
    const mounted = await mountApp(ConnectTools)
    await flush()

    expect(content(mounted.root)).toContain('--endpoint-url http://127.0.0.1:9100')
    expect(content(mounted.root)).toContain('Only programs on this computer can reach this address.')
    await click(tab(mounted.root, 'node-1-id'))
    expect(content(mounted.root)).toContain('--endpoint-url https://s3.node-1.example')
    expect(content(mounted.root)).toContain('Programs on any computer can use this address.')
    await click(tab(mounted.root, 'nextflow'))
    expect(content(mounted.root)).toContain("tes.endpoint = 'https://node-1.example/api/v1/ga4gh/tes/v1'")
    mounted.app.unmount()
  })

  it('removes a realm key on its own node', async () => {
    const mounted = await mountApp(ConnectTools)
    await flush()

    await click(element(keyRow(mounted.root, 'Lab server backup'), (node) => node.tag === 'button'))
    await click(button(mounted.root, 'Yes, remove it'))
    expect(revokeKey).toHaveBeenCalledWith('ARKNODE', { baseUrl: 'https://node-1.example/api/v1', token: 'token' })
    expect(removeDeviceKey).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('makes a key at the chosen place', async () => {
    const mounted = await mountApp(ConnectTools)
    await flush()

    expect(dialogs.create).toBeUndefined()
    await click(tab(mounted.root, 'node-1-id'))
    await dialogs.create?.('g1', 60)
    expect(createKey).toHaveBeenCalledWith({ group_id: 'g1', expires_in_seconds: 60 }, {
      baseUrl: 'https://node-1.example/api/v1',
      token: 'token',
    })
    mounted.app.unmount()
  })

  it('opens the key dialog when Home asks for a key', async () => {
    query.value = { create: 'key' }
    const mounted = await mountApp(ConnectTools)

    expect(content(mounted.root)).toContain('key-dialog-open')
    mounted.app.unmount()
  })

  it('says when a place cannot list its keys instead of showing none', async () => {
    listKeys.mockRejectedValueOnce(new Error('node is down'))
    deviceKeyList.value = []
    const mounted = await mountApp(ConnectTools)
    await flush()

    expect(content(mounted.root)).toContain('The keys on node-1 · Giessen could not be listed: node is down')
    expect(content(mounted.root)).not.toContain('You have no key yet.')
    mounted.app.unmount()
  })

  it('greys the lines and offers Start while this computer is not running', async () => {
    status.value = readStatus({ state: 'stopped' })
    const mounted = await mountApp(ConnectTools)
    await flush()

    expect(content(mounted.root)).toContain('Start Aruna to get an address.')
    expect(content(mounted.root)).toContain('ADDRESS_OF_THIS_COMPUTER')
    expect(nodes(mounted.root).some((node) => String(node.props.class ?? '').includes('opacity-50'))).toBe(true)
    mounted.app.unmount()
  })
})
