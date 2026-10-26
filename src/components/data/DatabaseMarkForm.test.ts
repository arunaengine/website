import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type DataLinkDocument, type DatabaseRequestView } from '@/lib/api'
import * as Databases from '@/lib/databases'
import * as LinkedPart from '@/lib/linkedPart'
import * as Emit from '@/lib/profiles/emit'
import { button, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({
  markDatabase: vi.fn(),
  createMetadata: vi.fn(),
  fetchRevisedCrate: vi.fn(),
  replaceMetadataRoCrate: vi.fn(),
  listGroupMetadata: vi.fn(),
  toMetadataDoc: (item: { document_path: string }) => ({ title: item.document_path.split('/').pop() }),
  nodeInfo: { value: { node: { realm_id: 'r1' } } },
  sessionEpoch: { value: 1 },
}))
const documents = ref<DataLinkDocument[]>([])
const links = { documents, state: ref('ready'), error: ref(null), complete: ref(true), hidden: ref(false), more: ref(false), loadingMore: ref(false), loadMore: vi.fn() }
const waitingList = ref<DatabaseRequestView[]>([])
const asked = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Field = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    props: { modelValue: String, options: Array },
    emits: ['update:modelValue'],
    setup: (props, { attrs, emit }) => () =>
      h(tag, { ...attrs, value: props.modelValue, options: props.options, 'onUpdate:modelValue': (value: string) => emit('update:modelValue', value) }),
  })

const component = compileClientComponent(new URL('./DatabaseMarkForm.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Field('input')),
  '@/components/ui/Notice.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props, { slots }) => () => h('aside', [props.title, slots.default?.()]) })),
  '@/components/ui/OptionToggle.vue': moduleDefault(Field('nav')),
  '@/components/ui/Select.vue': moduleDefault(Field('select')),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/components/ui/Textarea.vue': moduleDefault(Field('textarea')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useDatabases': { useDatabases: () => ({ reload: async () => {} }) },
  '@/composables/useDatabaseRequests': { useDatabaseRequests: () => ({ requests: waitingList, reload: async () => {} }) },
  '@/composables/useDatasetLinks': {
    useDatasetLinks: (target: { value: unknown }) => {
      asked(target.value)
      return links
    },
  },
  '@/composables/usePathPrefixes': { usePathPrefixes: () => ({ preselected: ref('datasets') }) },
  '@/composables/useSessionFiles': { joinPath: (directory: string, name: string) => `${directory}/${name}` },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ localNodeId: ref('n1') }) },
  '@/lib/api': { ApiError, apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/databases': Databases,
  '@/lib/linkedPart': LinkedPart,
  '@/lib/profiles/emit': Emit,
})

const doc = (id: string): DataLinkDocument => ({ document_id: id, group_id: 'g', document_path: `datasets/${id}`, graph_iri: id, title: id, links: [] })
const ROOT = 'arn:aruna:r1:n1:s3/lab/'
const crate = (parts: string[]) => ({
  '@context': 'https://w3id.org/ro/crate/1.1/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Lab', hasPart: parts.map((id) => ({ '@id': id })) },
    ...parts.map((id) => ({ '@id': id, '@type': 'Dataset' })),
  ],
})

async function render(props: Record<string, unknown> = {}) {
  return mountApp(component, { props: { bucket: 'lab', nodeId: null, setId: null, groupId: 'g1', groupName: 'Lab group', ...props } })
}

async function pick(root: Parameters<typeof element>[0], tag: string, value: string, label?: string) {
  const node = element(root, (item) => item.tag === tag && (!label || item.props['aria-label'] === label))
  ;(node.props['onUpdate:modelValue'] as (value: string) => void)(value)
  await flush()
}

async function submit(root: Parameters<typeof element>[0]) {
  await (button(root, 'Mark as database').props.onClick as () => Promise<void>)()
  await flush()
}

describe('database mark form', () => {
  beforeEach(() => {
    documents.value = [doc('d1')]
    links.more.value = false
    waitingList.value = []
    asked.mockReset()
    aruna.markDatabase.mockReset().mockResolvedValue({ status: 'published', entry: {} })
    aruna.fetchRevisedCrate.mockReset().mockResolvedValue({ rocrate: crate([ROOT]), revision: 'rev-1' })
    aruna.replaceMetadataRoCrate.mockReset().mockResolvedValue({})
    aruna.createMetadata.mockReset().mockResolvedValue({ document_id: 'new-1' })
    aruna.listGroupMetadata.mockReset().mockResolvedValue({ documents: [{ document_id: 'd2', document_path: 'datasets/genomes' }] })
  })
  afterEach(() => vi.useRealTimers())

  it('says what a database entry is and offers the linking datasets first, then the group datasets', async () => {
    const { root } = await render()
    await flush()

    expect(content(root)).toContain('The entry grants no access')
    const options = element(root, (node) => node.tag === 'select').props.options as { value: string }[]
    expect(options.map((option) => option.value)).toEqual(['d1', 'd2'])
  })

  it('shows pending consent once and links the dataset, without asking twice', async () => {
    aruna.markDatabase.mockResolvedValue({ status: 'pending_consent', entry: {}, request_id: 'r1' })
    const { root } = await render()
    await pick(root, 'select', 'd1')
    await submit(root)

    expect(aruna.replaceMetadataRoCrate).not.toHaveBeenCalled()
    expect(aruna.markDatabase).toHaveBeenCalledWith({ dataset_id: 'd1', target: { kind: 'ordinary', node_id: 'n1', bucket: 'lab' } })
    expect(content(root)).toContain('Pending consent')
    expect(content(root)).not.toContain('Mark as database')
    const to = JSON.parse(String(element(root, (node) => node.tag === 'a').props['data-to']))
    expect(to).toEqual({ name: 'dataset', params: { id: 'd1' } })
  })

  it('adds the bucket root to a dataset that does not name it, then marks', async () => {
    aruna.fetchRevisedCrate.mockResolvedValue({ rocrate: crate([]), revision: 'rev-7' })
    const { root } = await render()
    await pick(root, 'select', 'd2')
    await submit(root)

    const [id, body] = aruna.replaceMetadataRoCrate.mock.calls[0]
    expect(id).toBe('d2')
    expect(body.expected_revision).toBe('rev-7')
    const graph = body.rocrate['@graph'] as Record<string, unknown>[]
    expect(graph.find((entity) => entity['@id'] === './')?.hasPart).toEqual([{ '@id': ROOT }])
    expect(graph.find((entity) => entity['@id'] === ROOT)).toMatchObject({ '@type': 'Dataset' })
    expect(content(root)).toContain('Published')
  })

  it('creates a dataset in place and asks again while the node has not indexed it yet', async () => {
    vi.useFakeTimers()
    aruna.markDatabase.mockRejectedValueOnce(new ApiError(400, 'not linked yet')).mockResolvedValue({ status: 'published', entry: {} })
    const { root } = await render()
    await pick(root, 'nav', 'new')
    await pick(root, 'input', 'Bakrep', 'Name')
    await pick(root, 'input', '10.5281/zenodo.10522951', 'Landing page or DOI')
    const done = (button(root, 'Mark as database').props.onClick as () => Promise<void>)()
    await vi.advanceTimersByTimeAsync(1000)
    await done
    await flush()

    const [created] = aruna.createMetadata.mock.calls[0]
    expect(created).toMatchObject({ group_id: 'g1', path: 'datasets/bakrep', public: false })
    const root0 = (created.rocrate['@graph'] as Record<string, unknown>[]).find((entity) => entity['@id'] === './')
    expect(root0).toMatchObject({ name: 'Bakrep', identifier: 'https://doi.org/10.5281/zenodo.10522951', hasPart: [{ '@id': ROOT }] })
    expect(aruna.markDatabase).toHaveBeenCalledTimes(2)
    expect(aruna.markDatabase).toHaveBeenLastCalledWith({ dataset_id: 'new-1', target: expect.anything() })
    expect(content(root)).toContain('Published')
  })

  it('marks a bucket of another node by that node, asking that node for its datasets', async () => {
    const { root } = await render({ nodeId: 'n2' })
    aruna.fetchRevisedCrate.mockResolvedValue({ rocrate: crate(['arn:aruna:r1:n2:s3/lab/']), revision: 'rev-1' })
    await pick(root, 'select', 'd1')
    await submit(root)

    expect(asked).toHaveBeenCalledWith(expect.objectContaining({ node: 'n2' }))
    expect(aruna.replaceMetadataRoCrate).not.toHaveBeenCalled()
    expect(aruna.markDatabase).toHaveBeenCalledWith({ dataset_id: 'd1', target: { kind: 'ordinary', node_id: 'n2', bucket: 'lab' } })
    expect(content(root)).not.toContain('another node')
  })

  it('marks a distributed bucket by its set', async () => {
    aruna.fetchRevisedCrate.mockResolvedValue({ rocrate: crate(['https://w3id.org/aruna/data/r1/s1/']), revision: 'rev-1' })
    const { root } = await render({ setId: 's1' })
    await pick(root, 'select', 'd1')
    await submit(root)

    expect(aruna.replaceMetadataRoCrate).not.toHaveBeenCalled()
    expect(aruna.markDatabase).toHaveBeenCalledWith({ dataset_id: 'd1', target: { kind: 'distributed', set_id: 's1' } })
  })

  it('offers no mark while a request for the same target already waits', async () => {
    waitingList.value = [{ request_id: 'r1', entry: { entry_id: 'e', dataset_id: 'd1', owner_group: 'g', target: { kind: 'ordinary', node_id: 'n1', bucket: 'lab' } }, curator: 'u', created_at_ms: 1 }]
    const { root } = await render()
    await pick(root, 'select', 'd1')

    expect(button(root, 'Mark as database').props.disabled).toBe(true)
  })

  it('drops the answer of a mark for the bucket asked before', async () => {
    let settle: (value: unknown) => void = () => {}
    aruna.markDatabase.mockImplementation(() => new Promise((resolve) => (settle = resolve)))
    const bucket = ref('lab')
    const host = defineComponent(() => () => h(component, { bucket: bucket.value, nodeId: null, setId: null, groupId: 'g1' }))
    const { root } = await mountApp(host)
    await pick(root, 'select', 'd1')
    void (button(root, 'Mark as database').props.onClick as () => Promise<void>)()
    await flush()
    bucket.value = 'other'
    await flush()
    settle({ status: 'pending_consent', entry: {} })
    await flush()

    expect(aruna.markDatabase).toHaveBeenCalledTimes(1)
    expect(content(root)).not.toContain('Pending consent')
  })

  it('shows the node refusal and keeps the form', async () => {
    aruna.markDatabase.mockRejectedValue(new ApiError(403, 'no WRITE on the databases path'))
    const { root } = await render()
    await pick(root, 'select', 'd1')
    await submit(root)

    expect(content(root)).toContain('no WRITE on the databases path')
    expect(content(root)).toContain('Mark as database')
  })
})
