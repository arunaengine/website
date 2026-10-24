import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type DatabaseRequestView, type DatabaseView } from '@/lib/api'
import * as Databases from '@/lib/databases'
import { button, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({
  realmInfo: { value: { realm_id: 'realm1' } },
  sessionEpoch: { value: 1 },
  listDatabases: vi.fn(),
  removeDatabase: vi.fn(),
  getBucketDistribution: vi.fn(),
}))
const pending = ref<DatabaseRequestView[]>([])
const reloadList = vi.fn()

const Marker = (text: string) => defineComponent({ setup: () => () => h('section', text) })
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const component = compileClientComponent(new URL('./DatabasesAdmin.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/data/BucketSearchBox.vue': moduleDefault(Marker('bucket picker')),
  '@/components/data/DatabaseMarkForm.vue': moduleDefault(Marker('mark form')),
  '@/components/data/DatabaseRequestItem.vue': moduleDefault(Marker('pending request')),
  '@/components/settings/MockCurators.vue': moduleDefault(Marker('example roles')),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/CopyButton.vue': moduleDefault(Marker('copy')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useDatabaseRequests': {
    useDatabaseRequests: () => ({ requests: pending, loading: ref(false), failure: ref(null), reload: vi.fn() }),
  },
  '@/composables/useDatabases': { useDatabases: () => ({ reload: reloadList }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ isLocalNode: () => true, localNodeId: ref('n1') }) },
  '@/lib/api': { ApiError, apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/databases': Databases,
  '@/lib/distributedMock': { mockEnabled: () => false },
})

function view(bucket: string, extra: Partial<DatabaseView> = {}): DatabaseView {
  return { entry_id: `e-${bucket}`, dataset_id: `d-${bucket}`, owner_group: 'g1', target: { kind: 'ordinary', node_id: 'n1', bucket }, bucket, state: 'active', title: `${bucket} title`, ...extra }
}

async function render() {
  const { root } = await mountApp(component)
  await flush()
  return root
}

describe('databases admin', () => {
  beforeEach(() => {
    pending.value = []
    aruna.listDatabases.mockReset().mockResolvedValue({ databases: [] })
    aruna.removeDatabase.mockReset().mockResolvedValue(undefined)
    reloadList.mockReset()
  })

  it('names the access rule that lets others create databases', async () => {
    const root = await render()

    expect(content(root)).toContain('/realm1/admin/databases')
    expect(content(root)).not.toContain('example roles')
  })

  it('asks for the curator view and says why an entry is not plain', async () => {
    aruna.listDatabases.mockResolvedValue({
      databases: [view('spire'), view('lab', { title: null, bucket: '', state: 'dataset_hidden' })],
      next_after: 'e-lab',
    })
    const root = await render()

    expect(aruna.listDatabases).toHaveBeenCalledWith({ curation: true, limit: 50 })
    expect(content(root)).toContain('spire title')
    expect(content(root)).toContain('A dataset you cannot read')
    expect(content(root)).toContain('A bucket you cannot read')
    expect(content(root)).toContain('You cannot read the dataset')
    expect(content(root)).toContain('More databases')
  })

  it('removes a mark and reads the list again', async () => {
    aruna.listDatabases.mockResolvedValue({ databases: [view('spire')] })
    const root = await render()
    await (button(root, 'Remove').props.onClick as () => Promise<void>)()

    expect(aruna.removeDatabase).toHaveBeenCalledWith('e-spire')
    expect(reloadList).toHaveBeenCalled()
    expect(aruna.listDatabases).toHaveBeenCalledTimes(2)
  })

  it('tells an account without the right, and offers no mark form', async () => {
    aruna.listDatabases.mockRejectedValue(new ApiError(403, 'forbidden'))
    const root = await render()

    expect(content(root)).toContain('This account cannot curate databases.')
    expect(content(root)).not.toContain('bucket picker')
  })

  it('lists the marks that wait for the owning group', async () => {
    pending.value = [{ request_id: 'r1', entry: { entry_id: 'e', dataset_id: 'd', owner_group: 'g', target: { kind: 'distributed', set_id: 's' } }, curator: 'u', created_at_ms: 1 }]

    expect(content(await render())).toContain('pending request')
  })
})
