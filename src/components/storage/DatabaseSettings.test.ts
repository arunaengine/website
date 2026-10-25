import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type DatabaseRequestView } from '@/lib/api'
import * as Databases from '@/lib/databases'
import { button, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({ listDatabases: vi.fn(), removeDatabase: vi.fn(), sessionEpoch: { value: 1 } }))
const rows = ref<Databases.DatabaseRow[]>([])
const listState = ref('ready')
const pendingList = ref<DatabaseRequestView[]>([])
const reload = vi.fn()

const Marker = (text: string) => defineComponent({ setup: () => () => h('section', text) })
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const component = compileClientComponent(new URL('./DatabaseSettings.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/data/DatabaseHeader.vue': moduleDefault(Marker('dataset header')),
  '@/components/data/DatabaseMarkForm.vue': moduleDefault(Marker('mark form')),
  '@/components/data/DatabaseRequestItem.vue': moduleDefault(Marker('pending request')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useDatabaseRequests': {
    useDatabaseRequests: () => ({ requests: pendingList, failure: ref(null), ensure: vi.fn(), reload: vi.fn() }),
  },
  '@/composables/useDatabases': {
    useDatabases: () => ({
      ensure: vi.fn(),
      reload,
      state: listState,
      complete: ref(true),
      error: ref('node busy'),
      find: (bucket: string, nodeId: string | null, setId?: string | null) =>
        setId === undefined && !nodeId ? undefined : Databases.databaseOf(rows.value, Databases.targetOf(bucket, nodeId ?? 'n1', setId ?? null)),
    }),
  },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ localNodeId: ref('n1') }) },
  '@/lib/api': { ApiError, apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/databases': Databases,
})

const entry: Databases.DatabaseRow = {
  entryId: 'e1', datasetId: 'd1', bucket: 'lab', ownerGroup: 'g1', title: 'Lab', documentPath: null, state: 'active', public: false,
  target: { kind: 'ordinary', node_id: 'n1', bucket: 'lab' },
}

async function render(props: Record<string, unknown> = {}) {
  const mounted = await mountApp(component, { props: { bucket: 'lab', nodeId: null, setId: null, canAdmin: false, ...props } })
  await flush()
  return mounted.root
}

describe('database settings', () => {
  beforeEach(() => {
    rows.value = []
    listState.value = 'ready'
    pendingList.value = []
    aruna.listDatabases.mockReset().mockResolvedValue({ databases: [] })
    aruna.removeDatabase.mockReset().mockResolvedValue(undefined)
    reload.mockReset()
  })

  it('offers the mark to a curator for a bucket that is not a database', async () => {
    const root = await render()

    expect(content(root)).toContain('Not a database.')
    expect(content(root)).toContain('Mark as database')
    await (button(root, 'Mark as database').props.onClick as () => void)()
    await flush()
    expect(content(root)).toContain('mark form')
  })

  it('explains who can mark when the node refuses the curator view', async () => {
    aruna.listDatabases.mockRejectedValue(new ApiError(403, 'forbidden'))
    const root = await render()

    expect(content(root)).toContain('Realm admins and database curators can mark a bucket')
    expect(content(root)).not.toContain('Mark as database')
  })

  it('waits to offer the mark until the set of the bucket is known', async () => {
    expect(content(await render({ setId: undefined }))).not.toContain('Mark as database')
  })

  it('shows the dataset of a database and removes the mark', async () => {
    rows.value = [entry]
    const root = await render()

    expect(content(root)).toContain('dataset header')
    await (button(root, 'Remove the database mark').props.onClick as () => Promise<void>)()
    expect(aruna.removeDatabase).toHaveBeenCalledWith('e1')
    expect(reload).toHaveBeenCalled()
  })

  it('names an entry that its dataset no longer links', async () => {
    rows.value = [{ ...entry, state: 'no_longer_linked' }]

    expect(content(await render())).toContain('No longer linked by its dataset')
  })

  it('shows the request that waits for the owning group, matched by the target', async () => {
    pendingList.value = [{ request_id: 'r1', entry: { entry_id: 'e1', dataset_id: 'd1', owner_group: 'g1', target: entry.target }, curator: 'u1', created_at_ms: 1 }]
    const root = await render({ groupName: 'Genome Lab' })

    expect(content(root)).toContain('pending request')
    expect(content(root)).not.toContain('Not a database.')
  })

  it('ignores a request for another bucket', async () => {
    pendingList.value = [{ request_id: 'r1', entry: { entry_id: 'e1', dataset_id: 'd1', owner_group: 'g1', target: { kind: 'ordinary', node_id: 'n1', bucket: 'other' } }, curator: 'u1', created_at_ms: 1 }]

    expect(content(await render())).toContain('Not a database.')
  })

  it('does not say "Not a database" while the list loads, failed or the set is not known', async () => {
    listState.value = 'loading'
    expect(content(await render())).toContain('Not known yet')
    listState.value = 'failed'
    expect(content(await render())).toContain('The databases could not be read: node busy')
    listState.value = 'ready'
    expect(content(await render({ setId: undefined }))).toContain('Not known yet')
  })

  it('finds a mark that only the curator view lists, by the set of the bucket', async () => {
    const hidden = { ...entry, entry_id: 'e9', bucket: '', state: 'dataset_hidden', target: { kind: 'distributed', set_id: 's1' } }
    aruna.listDatabases.mockResolvedValue({ databases: [{ ...hidden, dataset_id: 'd9', owner_group: 'g1', public: false }] })
    const root = await render({ setId: 's1' })

    expect(content(root)).toContain('Marked as a database.')
    expect(content(root)).toContain('You cannot read the dataset')
    expect(content(await render({ setId: 's2' }))).toContain('Not a database.')
  })

  it('never offers to remove the database of another set with the same bucket name', async () => {
    rows.value = [{ ...entry, target: { kind: 'distributed', set_id: 's1' } }]
    const root = await render({ setId: 's2' })

    expect(content(root)).not.toContain('Remove the database mark')
    expect(content(root)).toContain('Not a database.')
  })
})
