import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

const listGroupConnectors = vi.fn()
const deleteGroupConnector = vi.fn()
const checkGroupConnector = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const Section = compileClientComponent(new URL('./ConnectorsSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRoute: () => ({ query: {} }) },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/EmptyState.vue': moduleDefault(Slot),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/ui/Dialog.vue': moduleDefault(Empty),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/components/groups/ConnectorDialog.vue': moduleDefault(Empty),
  '@/components/data/ConnectorEntriesBrowser.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ listGroupConnectors, deleteGroupConnector, checkGroupConnector, saving: ref(false) }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/utils': Utils,
  '@/lib/api': Api,
})

const CONNECTOR = {
  connector_id: 'c1',
  group_id: 'g1',
  name: 'mirror',
  kind: 'ftp',
  public_config: { endpoint: 'ftp://mirror.test' },
  created_at: '',
  updated_at: '',
  created_by: 'u1',
  has_secret_config: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  listGroupConnectors.mockResolvedValue({ connectors: [CONNECTOR] })
})

describe('ConnectorsSection', () => {
  it('shows the wait on the confirmed Delete, sends it once and frees it when it fails', async () => {
    let refuse: (err: unknown) => void = () => {}
    deleteGroupConnector.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)))
    const { root } = await mountApp(defineComponent(() => () => h(Section, { groupId: 'g1', canWrite: true })))
    await flush()
    await click(element(root, (node) => node.props['aria-label'] === 'Delete connector mirror'))
    void (button(root, 'Delete').props.onClick as () => Promise<void>)()
    await flush()
    const waiting = button(root, 'Deleting the connector')
    expect(waiting.props['aria-busy']).toBe(true)
    expect(waiting.props.disabled).toBe(true)
    await (waiting.props.onClick as () => Promise<void>)()
    expect(deleteGroupConnector).toHaveBeenCalledTimes(1)
    refuse(new Error('still in use'))
    await flush()
    expect(button(root, 'Delete').props['aria-busy']).toBe(false)
    expect(button(root, 'Delete').props.disabled).toBe(false)
    expect(content(root)).toContain('still in use')
  })
})
