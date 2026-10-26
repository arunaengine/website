import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataLinkDocument, DatabaseRequestView } from '@/lib/api'
import * as Databases from '@/lib/databases'
import * as LinkedPart from '@/lib/linkedPart'
import { button, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({ markDatabase: vi.fn(), nodeInfo: { value: { node: { realm_id: 'r1' } } }, sessionEpoch: { value: 1 } }))
const documents = ref<DataLinkDocument[]>([])
const links = { documents, state: ref('ready'), error: ref(null), complete: ref(true), hidden: ref(false), more: ref(false), loadingMore: ref(false), loadMore: vi.fn() }
const waitingList = ref<DatabaseRequestView[]>([])

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const component = compileClientComponent(new URL('./DatabaseMarkForm.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Select.vue': moduleDefault(Slotted('select')),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useDatabases': { useDatabases: () => ({ reload: async () => {} }) },
  '@/composables/useDatabaseRequests': { useDatabaseRequests: () => ({ requests: waitingList, reload: async () => {} }) },
  '@/composables/useDatasetLinks': { useDatasetLinks: () => links },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ localNodeId: ref('n1') }) },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/databases': Databases,
  '@/lib/linkedPart': LinkedPart,
})

const doc = (id: string): DataLinkDocument => ({ document_id: id, group_id: 'g', document_path: `datasets/${id}`, graph_iri: id, title: id, links: [] })

async function render(props: Record<string, unknown> = {}) {
  return mountApp(component, { props: { bucket: 'lab', nodeId: null, setId: null, ...props } })
}

async function choose(root: Parameters<typeof element>[0], id: string) {
  ;(element(root, (node) => node.tag === 'select').props['onUpdate:modelValue'] as (value: string) => void)(id)
  await flush()
}

describe('database mark form', () => {
  beforeEach(() => {
    documents.value = [doc('d1')]
    links.complete.value = true
    links.more.value = false
    waitingList.value = []
    aruna.markDatabase.mockReset()
  })

  it('asks once: the mark waits for the owning group and is not sent again', async () => {
    aruna.markDatabase.mockResolvedValue({ status: 'pending_consent', entry: {}, request_id: 'r1' })
    const { root } = await render()
    await choose(root, 'd1')
    await (button(root, 'Mark as database').props.onClick as () => Promise<void>)()
    await flush()

    expect(aruna.markDatabase).toHaveBeenCalledTimes(1)
    expect(content(root)).toContain('The mark takes effect when they agree')
    expect(button(root, 'Mark as database').props.disabled).toBe(true)
    await (button(root, 'Mark as database').props.onClick as () => Promise<void>)()
    expect(aruna.markDatabase).toHaveBeenCalledTimes(1)
  })

  it('offers no mark while a request for the same target already waits', async () => {
    waitingList.value = [{ request_id: 'r1', entry: { entry_id: 'e', dataset_id: 'd1', owner_group: 'g', target: { kind: 'ordinary', node_id: 'n1', bucket: 'lab' } }, curator: 'u', created_at_ms: 1 }]
    const { root } = await render()
    await choose(root, 'd1')

    expect(button(root, 'Mark as database').props.disabled).toBe(true)
  })

  it('drops the answer of a mark for the bucket asked before', async () => {
    let settle: (value: unknown) => void = () => {}
    aruna.markDatabase.mockImplementation(() => new Promise((resolve) => (settle = resolve)))
    const bucket = ref('lab')
    const host = defineComponent(() => () => h(component, { bucket: bucket.value, nodeId: null, setId: null }))
    const { root } = await mountApp(host)
    await choose(root, 'd1')
    void (button(root, 'Mark as database').props.onClick as () => Promise<void>)()
    await flush()
    bucket.value = 'other'
    await flush()
    settle({ status: 'pending_consent', entry: {} })
    await flush()

    expect(aruna.markDatabase).toHaveBeenCalledTimes(1)
    expect(content(root)).not.toContain('The mark takes effect when they agree')
  })

  it('says "no dataset" only for a complete answer and seeds a new dataset with the bucket root', async () => {
    documents.value = []
    const first = await render()
    expect(content(first.root)).toContain('No dataset lists this bucket as a part yet.')
    const to = JSON.parse(String(element(first.root, (node) => node.tag === 'a').props['data-to']))
    expect(to).toEqual({ name: 'dataset-new', query: { part: 'arn:aruna:r1:n1:s3/lab/', partName: 'lab' } })

    links.more.value = true
    const second = await render()
    expect(content(second.root)).toContain('No dataset you can read lists this bucket')
    expect(content(second.root)).toContain('More datasets')
  })
})
