import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Databases from '@/lib/databases'
import { compileClientComponent, content, element, click, mountApp, moduleDefault } from '@/test/clientRender'

const state = ref('ready')
const rows = ref<Databases.DatabaseRow[]>([])
const complete = ref(true)

const RowStub = defineComponent({
  props: { bucket: String, subtitle: String },
  emits: ['open'],
  setup: (props, { emit }) => () => h('button', { 'data-bucket': props.bucket, onClick: () => emit('open') }, `${props.bucket} ${props.subtitle ?? ''}`),
})

const component = compileClientComponent(new URL('./DatabaseRows.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/data/BucketRow.vue': moduleDefault(RowStub),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useDatabases': {
    useDatabases: () => ({
      rows, state, error: ref('node busy'), complete, ensure: vi.fn(),
      locate: (item: Databases.DatabaseRow) => Databases.placeOf(item, 'n1'),
    }),
  },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ localNodeId: ref('n1'), isLocalNode: (id: string) => id === 'n1' }),
  },
  '@/lib/databases': Databases,
})

function row(bucket: string, extra: Partial<Databases.DatabaseRow> = {}): Databases.DatabaseRow {
  return {
    datasetId: `d-${bucket}`, bucket, ownerGroup: 'g1', title: `${bucket} title`, public: false,
    target: { kind: 'ordinary', node_id: 'n1', bucket }, places: [{ bucket, nodeId: 'n1' }],
    description: null,
    metadata: { database: true, dataset: `d-${bucket}` },
    ...extra,
  }
}

async function render(filter = '') {
  return mountApp(component, { props: { filter, active: '' } })
}

describe('database rows', () => {
  it('lists each database with the dataset title and opens it on its own node', async () => {
    state.value = 'ready'
    rows.value = [row('lab'), row('far', { target: { kind: 'ordinary', node_id: 'n2', bucket: 'far' }, places: [{ bucket: 'far', nodeId: 'n2' }] })]
    const opened: unknown[][] = []
    const { root } = await mountApp(component, { props: { filter: '', active: '', onOpen: (...args: unknown[]) => opened.push(args) } })

    expect(content(root)).toContain('lab lab title')
    await click(element(root, (node) => node.props['data-bucket'] === 'far'))
    await click(element(root, (node) => node.props['data-bucket'] === 'lab'))

    expect(opened).toEqual([['far', 'n2', 'g1'], ['lab', null, 'g1']])
  })

  it('filters by the typed text', async () => {
    state.value = 'ready'
    rows.value = [row('lab'), row('spire')]
    const { root } = await render('spi')

    expect(content(root)).toContain('spire spire title')
    expect(content(root)).not.toContain('lab')
  })

  it('keeps a failed read apart from an empty list and notes a partial one', async () => {
    rows.value = []
    state.value = 'failed'
    expect(content((await render()).root)).toContain('node busy')

    state.value = 'ready'
    expect(content((await render()).root)).toContain('No database is listed for you yet')
    complete.value = false
    expect(content((await render()).root)).toContain('The list is partial')
    complete.value = true
  })

  it('opens a set on this node when it holds it, else on a member node', async () => {
    state.value = 'ready'
    const target = { kind: 'distributed' as const, set_id: 's1' }
    rows.value = [
      row('spire', { target, places: [{ bucket: 'spire', nodeId: 'n2' }, { bucket: 'spire', nodeId: 'n1' }] }),
      row('reef', { target: { kind: 'distributed', set_id: 's2' }, places: [{ bucket: 'reef', nodeId: 'n3' }] }),
    ]
    const opened: unknown[][] = []
    const { root } = await mountApp(component, { props: { filter: '', active: '', onOpen: (...args: unknown[]) => opened.push(args) } })

    await click(element(root, (node) => node.props['data-bucket'] === 'spire'))
    await click(element(root, (node) => node.props['data-bucket'] === 'reef'))
    expect(opened).toEqual([['spire', null, 'g1'], ['reef', 'n3', 'g1']])
  })
})
