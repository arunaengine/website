import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

const listRepositoryConnectors = vi.fn()
const deleteRepositoryConnector = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const Section = compileClientComponent(new URL('./RepositoriesSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/EmptyState.vue': moduleDefault(Slot),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/components/groups/RepositoryDialog.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t'), sessionEpoch: ref(0) }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/utils': Utils,
  '@/lib/api': { ...Api, listRepositoryConnectors, deleteRepositoryConnector },
})

const REPOSITORY = {
  connector_id: 'r1',
  group_id: 'g1',
  name: 'zenodo',
  kind: 'invenio',
  endpoint: 'https://zenodo.test',
  has_secret_config: false,
  created_at: '',
  updated_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  listRepositoryConnectors.mockResolvedValue([REPOSITORY])
})

describe('RepositoriesSection', () => {
  it('shows the wait on the confirmed Delete, sends it once and frees it when it fails', async () => {
    let refuse: (err: unknown) => void = () => {}
    deleteRepositoryConnector.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)))
    const { root } = await mountApp(defineComponent(() => () => h(Section, { groupId: 'g1', canWrite: true })))
    await flush()
    await click(element(root, (node) => node.props['aria-label'] === 'Delete repository zenodo'))
    void (button(root, 'Delete').props.onClick as () => Promise<void>)()
    await flush()
    const waiting = button(root, 'Deleting the repository')
    expect(waiting.props['aria-busy']).toBe(true)
    expect(waiting.props.disabled).toBe(true)
    await (waiting.props.onClick as () => Promise<void>)()
    expect(deleteRepositoryConnector).toHaveBeenCalledTimes(1)
    refuse(new Error('dataset links still use it'))
    await flush()
    expect(button(root, 'Delete').props['aria-busy']).toBe(false)
    expect(button(root, 'Delete').props.disabled).toBe(false)
    expect(content(root)).toContain('dataset links still use it')
  })
})
