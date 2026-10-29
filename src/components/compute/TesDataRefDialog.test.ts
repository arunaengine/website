import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Tes from '@/lib/tes'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Passthrough = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()) })
const Empty = defineComponent(() => () => null)
const s3State = { endpoint: ref<string | null>('https://s3.test'), hasActiveKey: ref(true), ensureSession: async () => {} }
const V1 = '01K8W1B3D5F7H9KMQ1S3V5X7Z1'
const V2 = '01K8W1B3D5F7H9KMQ1S3V5X7Z2'
const listBucketObjects = vi.fn(async () => ({ bucket: 'far-db', objects: [{ key: 'db/6.0/y.tsv', version_id: V2 }], prefixes: [] }))
const currentUser = ref<{ id: string } | null>(null)
const myGroups = ref<Array<{ id: string; name: string }>>([])
const sessionEpoch = ref(0)
const searchBuckets = vi.fn(async (_q: string, _options: unknown) => ({ hits: [] as unknown[], nodes_queried: 0, nodes_failed: 0, failed_nodes: [] as string[] }))

const component = compileClientComponent(new URL('./TesDataRefDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Passthrough },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/OptionToggle.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs }) => () => h('div', { ...attrs, role: 'radiogroup' }) })),
  '@/components/data/ObjectBrowserPanel.vue': moduleDefault(defineComponent({
    props: { bucket: String, groupId: String },
    setup: (props) => () => h('section', `browser ${props.bucket ?? 'any'} ${props.groupId ?? ''}`),
  })),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(Empty),
  '@/components/data/BucketSearchBox.vue': moduleDefault(Empty),
  '@/components/compute/RemoteObjectPicker.vue': moduleDefault(defineComponent({
    props: { bucket: String, nodeId: String },
    emits: ['add'],
    setup: (props, { emit }) => () => h('button', {
      onClick: () => emit('add', { files: [{ key: 'db/x.tsv', versionId: V1, name: 'x.tsv' }], folders: [{ prefix: 'db/6.0/', name: '6.0' }] }),
    }, `pick ${props.bucket} ${props.nodeId}`),
  })),
  '@/components/data/add/DatabasesTab.vue': moduleDefault(defineComponent({
    emits: ['choose'],
    setup: (_, { emit }) => () => h('div', [
      h('button', { onClick: () => emit('choose', 'far-db', 'n2', 'g2') }, 'Far database'),
      h('button', { onClick: () => emit('choose', 'spire', 'n1', 'g3') }, 'Local database'),
    ]),
  })),
  '@/composables/useS3': { useS3: () => s3State },
  '@/composables/useAruna': { useAruna: () => ({ currentUser, myGroups, nodeInfo: ref({ node: { realm_id: 'realm' } }), listBucketObjects, searchBuckets, sessionEpoch }) },
  '@/composables/useBucketCount': {
    listBuckets: async (search: typeof searchBuckets) => {
      const answer = await search('', {})
      return { hits: answer.hits, complete: answer.nodes_failed === 0 }
    },
  },
  '@/components/ui/NodeLabel.vue': moduleDefault(defineComponent({ props: { nodeId: String }, setup: (props) => () => h('span', `node ${props.nodeId}`) })),
  '@/composables/useGroupSelection': { activeGroupId: ref('') },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'n1' }) },
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
  '@/lib/tes': Tes,
})

describe('TES input picker my buckets', () => {
  it('lists my groups\' buckets on other nodes and browses one there', async () => {
    currentUser.value = { id: 'u1' }
    myGroups.value = [{ id: 'g1', name: 'demo' }]
    const hit = (bucket: string, node: string, group: string) => ({ arn: '', bucket, node_id: node, group_id: group, created_at: '' })
    searchBuckets.mockResolvedValue({ hits: [hit('here', 'n1', 'g1'), hit('far', 'n2', 'g1'), hit('foreign', 'n2', 'g9')], nodes_queried: 2, nodes_failed: 0, failed_nodes: [] })
    const { root } = await mountApp(component, { props: { open: true, mode: 'input' } })
    await flush()

    const text = content(root)
    expect(text).toContain('On other nodes')
    expect(text).toContain('far')
    expect(text).not.toContain('foreign')
    expect(text).not.toMatch(/here\s*demo/)
    await click(button(root, 'far'))
    expect(content(root)).toContain('pick far n2')
    currentUser.value = null
    myGroups.value = []
  })
})

describe('TES input picker remote identity', () => {
  it('merges distributed buckets by set and keeps ordinary buckets per node', async () => {
    currentUser.value = { id: 'u1' }
    myGroups.value = [{ id: 'g1', name: 'demo' }]
    const hit = (bucket: string, node: string, set_id?: string) => ({ arn: '', bucket, node_id: node, group_id: 'g1', created_at: '', set_id })
    searchBuckets.mockResolvedValue({
      hits: [hit('reads', 'n1'), hit('reads', 'n2'), hit('reads', 'n3'), hit('shared', 'n1', 's1'), hit('shared', 'n2', 's1'), hit('wide', 'n2', 's2'), hit('wide', 'n3', 's2')],
      nodes_queried: 3, nodes_failed: 0, failed_nodes: [],
    })
    const { root } = await mountApp(component, { props: { open: true, mode: 'input' } })
    await flush()

    const text = content(root)
    expect(text).toMatch(/reads\s*demo\s*node n2/)
    expect(text).toMatch(/reads\s*demo\s*node n3/)
    expect(text).not.toContain('shared')
    expect(text.match(/wide/g)).toHaveLength(1)
    currentUser.value = null
    myGroups.value = []
  })
})

describe('TES input picker remote failures', () => {
  it('shows a failed or partial listing and lists again on retry', async () => {
    currentUser.value = { id: 'u1' }
    myGroups.value = [{ id: 'g1', name: 'demo' }]
    searchBuckets.mockRejectedValueOnce(new Error('down'))
    const { root } = await mountApp(component, { props: { open: true, mode: 'input' } })
    await flush()
    expect(content(root)).toContain('Could not list your buckets on the other nodes.')

    searchBuckets.mockResolvedValueOnce({ hits: [{ arn: '', bucket: 'far', node_id: 'n2', group_id: 'g1', created_at: '' }], nodes_queried: 3, nodes_failed: 1, failed_nodes: ['n3'] })
    await click(button(root, 'Retry'))
    await flush()
    const text = content(root)
    expect(text).toContain('far')
    expect(text).toContain('Some nodes did not answer, so this list may be incomplete.')
    currentUser.value = null
    myGroups.value = []
  })
})

describe('TES input picker sessions', () => {
  it('drops a listing that answers after the account changed', async () => {
    currentUser.value = { id: 'u1' }
    myGroups.value = [{ id: 'g1', name: 'demo' }]
    let answer!: (value: unknown) => void
    searchBuckets.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve as never }))
    const { root } = await mountApp(component, { props: { open: true, mode: 'input' } })
    searchBuckets.mockResolvedValue({ hits: [], nodes_queried: 1, nodes_failed: 0, failed_nodes: [] })
    myGroups.value = [{ id: 'g1', name: 'other' }]
    sessionEpoch.value++
    await flush()
    answer({ hits: [{ arn: '', bucket: 'private-a', node_id: 'n2', group_id: 'g1', created_at: '' }], nodes_queried: 1, nodes_failed: 0, failed_nodes: [] })
    await flush()

    expect(content(root)).not.toContain('private-a')
    currentUser.value = null
    myGroups.value = []
  })
})

describe('TES input picker databases', () => {
  it('pins picks of a database on another node to that node and version', async () => {
    const added: unknown[] = []
    const { root } = await mountApp(component, { props: { open: true, mode: 'input', onAdd: (entry: unknown) => added.push(entry) } })
    ;(element(root, (node) => node.props.role === 'radiogroup').props['onUpdate:modelValue'] as (value: string) => void)('databases')
    await flush()

    await click(button(root, 'Far database'))
    await click(button(root, 'pick far-db n2'))
    await flush()
    expect(listBucketObjects).toHaveBeenCalledWith('far-db', { prefix: 'db/6.0/', cursor: undefined, limit: 1000 }, 'n2')
    expect(added).toEqual([
      { kind: 'file', url: `arn:aruna:realm:n2:s3/far-db/db/x.tsv@${V1}`, path: '/inputs/x.tsv', name: 'x.tsv' },
      { kind: 'file', url: `arn:aruna:realm:n2:s3/far-db/db/6.0/y.tsv@${V2}`, path: '/inputs/6.0/y.tsv', name: '6.0/y.tsv' },
    ])
  })

  it('keeps a folder of a database on this node as one folder input', async () => {
    const added: unknown[] = []
    const { root } = await mountApp(component, { props: { open: true, mode: 'input', onAdd: (entry: unknown) => added.push(entry) } })
    ;(element(root, (node) => node.props.role === 'radiogroup').props['onUpdate:modelValue'] as (value: string) => void)('databases')
    await flush()

    await click(button(root, 'Local database'))
    await click(button(root, 'pick spire n1'))
    await flush()
    expect(added[1]).toEqual({ kind: 'folder', bucket: 'spire', prefix: 'db/6.0/', name: '6.0', basePath: '/inputs/6.0/', files: [], directory: true })
  })

  it('offers databases without an S3 session, which only my buckets need', async () => {
    s3State.endpoint.value = null
    s3State.hasActiveKey.value = false
    const { root } = await mountApp(component, { props: { open: true, mode: 'input' } })
    expect(content(root)).toContain('does not advertise an S3 endpoint')
    ;(element(root, (node) => node.props.role === 'radiogroup').props['onUpdate:modelValue'] as (value: string) => void)('databases')
    await flush()

    expect(content(root)).not.toContain('does not advertise an S3 endpoint')
    await click(button(root, 'Far database'))
    expect(content(root)).toContain('pick far-db n2')
    s3State.endpoint.value = 'https://s3.test'
    s3State.hasActiveKey.value = true
  })
})
