import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as BucketName from '@/lib/bucketName'
import * as BucketNaming from '@/lib/bucketNaming'
import * as DistributedMock from '@/lib/distributedMock'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, typeValue, type HostNode } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean },
  setup: (props, { attrs, slots }) => () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, invalid: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', { ...attrs, invalid: props.invalid, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const StorageStub = defineComponent({ props: { open: Boolean }, setup: (props) => () => h('aside', { 'data-storage': props.open }) })
const ResultsStub = defineComponent({ props: { open: Boolean, name: String }, setup: (props) => () => h('aside', { 'data-results': props.open }, props.name) })

const s3 = { activateContext: vi.fn(), createBucket: vi.fn() }
// The group's routing and storages per node; a node missing here answers with no rule.
const routings = new Map<string, object>()
const getGroupRouting = vi.fn(async (_group: string, node: string) => routings.get(node) ?? { group_id: 'g1', warnings: [] })
const listGroupBackends = vi.fn(async () => ({ backends: [{ backend_id: 'b2', group_id: 'g1', kind: 's3', name: 'de.NBI-spire', public_config: {} }] }))
const free = new Map<string, number | null>([['https://one', 196 * 1024 ** 3], ['https://two', null]])
const nodeList = ref([
  { nodeId: 'two', kind: 'storage', reachable: true, isLocal: false, apiBase: 'https://two' },
  { nodeId: 'one', kind: 'storage', reachable: true, isLocal: false, apiBase: 'https://one' },
  { nodeId: 'laptop', kind: 'user', reachable: true, isLocal: false, apiBase: 'https://laptop' },
  { nodeId: 'down', kind: 'storage', reachable: false, isLocal: false, apiBase: 'https://down' },
])

const Dialog = compileClientComponent(new URL('./CreateBucketDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(defineComponent({ props: { message: String }, setup: (props) => () => h('p', { role: 'alert' }, props.message) })),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('span')),
  '@/components/data/BucketCreateResults.vue': moduleDefault(ResultsStub),
  '@/components/data/BucketStorageDialog.vue': moduleDefault(StorageStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://one'), sessionEpoch: ref(1), apiGroups: ref([{ group_id: 'g1', display_name: 'spire' }]), getGroupRouting, listGroupBackends }),
  },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ nodes: nodeList, displayName: (id: string) => `name-${id}`, isLocalNode: () => false }) },
  '@/composables/useS3': { useS3: () => s3, s3ErrorMessage: (err: Error) => err.message },
  '@/lib/bucketName': BucketName,
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/bucketPlace': { readFreeSpace: async (base: string) => free.get(base) ?? null },
  '@/lib/distributedMock': DistributedMock,
  '@/lib/utils': Utils,
})

async function mount(nodeId: string | null = 'one') {
  const created: unknown[] = []
  const open = ref(true)
  const mounted = await mountApp(defineComponent(() => () =>
    h(Dialog, { open: open.value, groupId: 'g1', nodeId, onCreated: (bucket: object, source?: string) => created.push(source === undefined ? bucket : { ...bucket, source }), 'onUpdate:open': (value: boolean) => (open.value = value) })))
  await flush()
  const name = () => element(mounted.root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Bucket name')
  const create = () => button(mounted.root, 'Create bucket')
  const radios = () => nodes(mounted.root).filter((node) => node.tag === 'input' && node.props.type === 'radio')
  // The node rows, each a label with its radio, in the order shown.
  const rows = () => nodes(mounted.root).filter((node) => node.tag === 'label' && nodes(node).some((child) => child.props.name === 'bucket-node'))
  const radioOf = (row: HostNode) => element(row, (node) => node.props.name === 'bucket-node')
  const chosen = () => rows().find((row) => radioOf(row).props.checked)
  const pick = async (label: string) => {
    ;(radioOf(rows().find((row) => content(row).includes(label))!).props.onChange as () => void)()
    await flush()
  }
  return { root: mounted.root, created, open, name, create, radios, rows, chosen, pick }
}

beforeEach(() => routings.clear())

describe('new bucket dialog', () => {
  it('names the rule under the name and refuses a broken name', async () => {
    const { root, name, create } = await mount()
    expect(content(root)).toContain(BucketName.BUCKET_NAME_REQUIREMENT)
    await typeValue(name(), 'b1')
    expect(content(root)).toContain('Bucket names must contain at least 3 characters.')
    expect(name().props.invalid).toBe('error')
    expect(create().props.disabled).toBe(true)
  })

  it('offers the reachable realm nodes, the open node first, with their free space, and a spread', async () => {
    const { root, rows, chosen, name } = await mount('one')
    const labels = rows().map((row) => content(row))
    expect(labels[0]).toContain('name-one')
    expect(labels[0]).toContain('196\u00a0GiB free')
    expect(labels[1]).toContain('name-two')
    expect(labels[1]).not.toContain('free')
    expect(labels[2]).toContain('Spread over several nodes')
    expect(labels).toHaveLength(3)
    expect(content(chosen()!)).toContain('name-one')
    expect(content(root)).not.toContain('laptop')
    // Stored data names the node that keeps it; a valid name shows its address.
    expect(content(root)).toContain('Kept on name-one, counted against quotas.')
    await typeValue(name(), 'my-results')
    expect(content(root)).toContain('The address will be s3://my-results')
  })

  it('chooses a storage node before the management node, even when the management node is open', async () => {
    nodeList.value = [{ nodeId: 'mgmt', kind: 'management', reachable: true, isLocal: true, apiBase: 'https://mgmt' }, ...nodeList.value]
    const { rows, chosen } = await mount('mgmt')
    const names = rows().map((row) => content(row).match(/name-(two|one|mgmt)/)?.[0])
    nodeList.value = nodeList.value.slice(1)

    expect(names.slice(0, 3)).toEqual(['name-two', 'name-one', 'name-mgmt'])
    expect(content(chosen()!)).toContain('name-two')
  })

  it('needs a source address for a referenced bucket and hands it on after creating it', async () => {
    s3.activateContext.mockResolvedValueOnce({ issuerNodeId: 'one', accessKeyId: 'k1' })
    s3.createBucket.mockResolvedValueOnce(undefined)
    const { root, name, create, radios, created } = await mount('one')
    await typeValue(name(), 'refseq')
    ;(radios()[1].props.onChange as () => void)()
    await flush()
    expect(create().props.disabled).toBe(true)
    expect(content(root)).not.toContain('Spread over several nodes')

    await typeValue(element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Source address'), 'https://ftp.example.org/genomes/')
    await click(create())
    expect(created).toEqual([{ bucket: 'refseq', nodeId: 'one', groupId: 'g1', source: 'https://ftp.example.org/genomes/' }])
  })

  it('creates the bucket through a session on the chosen node and opens it', async () => {
    s3.activateContext.mockResolvedValueOnce({ issuerNodeId: 'two', accessKeyId: 'k2' })
    s3.createBucket.mockResolvedValueOnce(undefined)
    const { name, create, pick, created, open } = await mount('one')
    await typeValue(name(), 'assemblies-2026')
    await pick('name-two')
    await click(create())

    expect(s3.activateContext).toHaveBeenCalledWith('two', 'g1')
    expect(s3.createBucket).toHaveBeenCalledWith('assemblies-2026', 'two', { nodeId: 'two', groupId: 'g1', accessKeyId: 'k2' })
    expect(created).toEqual([{ bucket: 'assemblies-2026', nodeId: 'two', groupId: 'g1' }])
    expect(open.value).toBe(false)
  })

  it('keeps the dialog open with the reason when the node refuses', async () => {
    s3.activateContext.mockResolvedValueOnce({ issuerNodeId: 'one', accessKeyId: 'k1' })
    s3.createBucket.mockRejectedValueOnce(new Error('A bucket named reef already exists.'))
    const { root, name, create, open } = await mount('one')
    await typeValue(name(), 'reef')
    await click(create())
    expect(content(root)).toContain('A bucket named reef already exists.')
    expect(open.value).toBe(true)
  })

  it('sets the nodes and copies of a spread bucket before it shows each node\'s answer', async () => {
    s3.activateContext.mockClear()
    const { root, name, create, pick } = await mount('one')
    await typeValue(name(), 'big-data')
    await pick('Spread over several nodes')
    expect(element(root, (node) => node.tag === 'aside' && 'data-storage' in node.props).props['data-storage']).toBe(true)

    await click(create())
    expect(element(root, (node) => node.tag === 'aside' && 'data-results' in node.props).props['data-results']).toBe(true)
    expect(s3.activateContext).not.toHaveBeenCalled()
  })

  it('says what a new bucket gets on each node and starts on the node whose storage has the rule', async () => {
    routings.set('two', { group_id: 'g1', default_target: { backend_id: 'b2' }, bucket_template: 'aruna-{group}-{bucket}', warnings: [] })
    const { root, rows, chosen, name } = await mount('one')
    expect(content(chosen()!)).toContain('name-two')
    const [one, two] = rows()
    expect(content(one)).toContain('Plain Aruna bucket, no storage rule on this node')
    expect(content(two)).toContain('Own S3 bucket aruna-spire-{bucket}')
    expect(content(two)).toContain('on de.NBI-spire')
    await typeValue(name(), 'progenomes')
    expect(content(rows()[1])).toContain('aruna-spire-progenomes')
    expect(content(root)).toContain('Kept on name-two, counted against quotas.')
  })

  it('says nothing about a node whose rule cannot be read and keeps the open node', async () => {
    getGroupRouting.mockRejectedValueOnce(new Error('forbidden')).mockRejectedValueOnce(new Error('forbidden'))
    const { rows, chosen, name, create } = await mount('one')
    expect(content(chosen()!)).toContain('name-one')
    await typeValue(name(), 'progenomes')
    expect(create().props.disabled).toBe(false)
    for (const row of rows().slice(0, 2)) {
      expect(content(row)).not.toContain('Plain Aruna bucket')
      expect(content(row)).not.toContain('Own S3 bucket')
    }
  })

  it('waits for the rule of every node before a bucket goes to the node it chose', async () => {
    const replies: ((routing: object) => void)[] = []
    const late = () => new Promise<object>((resolve) => replies.push(resolve))
    getGroupRouting.mockImplementationOnce(late).mockImplementationOnce(late)
    const { chosen, name, create } = await mount('one')
    await typeValue(name(), 'progenomes')
    expect(content(chosen()!)).toContain('name-one')
    expect(create().props.disabled).toBe(true)

    replies[0]({ group_id: 'g1', warnings: [] })
    await flush()
    expect(create().props.disabled).toBe(true)
    replies[1]({ group_id: 'g1', default_target: { backend_id: 'b2' }, bucket_template: 'aruna-{bucket}', warnings: [] })
    await flush()
    expect(content(chosen()!)).toContain('name-two')
    expect(create().props.disabled).toBe(false)
  })

  it('lets a node picked by hand take the bucket while the rules are still read', async () => {
    getGroupRouting.mockImplementationOnce(() => new Promise(() => {})).mockImplementationOnce(() => new Promise(() => {}))
    const { name, create, pick } = await mount('one')
    await typeValue(name(), 'progenomes')
    expect(create().props.disabled).toBe(true)
    await pick('name-one')
    expect(create().props.disabled).toBe(false)
  })

  it('chooses the node with the rule on the way back to stored data when its rule came meanwhile', async () => {
    const replies: ((routing: object) => void)[] = []
    const late = () => new Promise<object>((resolve) => replies.push(resolve))
    getGroupRouting.mockImplementationOnce(late).mockImplementationOnce(late)
    const { radios, chosen, name, create } = await mount('one')
    await typeValue(name(), 'progenomes')
    ;(radios()[1].props.onChange as () => void)()
    await flush()
    replies[0]({ group_id: 'g1', warnings: [] })
    replies[1]({ group_id: 'g1', default_target: { backend_id: 'b2' }, bucket_template: 'aruna-{bucket}', warnings: [] })
    await flush()
    expect(content(chosen()!)).toContain('name-one')

    ;(radios()[0].props.onChange as () => void)()
    await flush()
    expect(content(chosen()!)).toContain('name-two')
    expect(create().props.disabled).toBe(false)
  })
})
