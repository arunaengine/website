import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFolder, readTransfer, type DeviceTransfer, type SyncedFolder } from '@/lib/deviceApi'

const folders = ref<SyncedFolder[]>([])
const foldersState = ref('ready')
const transfers = ref<DeviceTransfer[]>([])
const transfersState = ref('ready')
const decisionItems = ref<Array<{ folderId: string; folder: string; text: string; atMs: number | null; outcome: string }>>([])
const decisionsState = ref('ready')
const decisionsError = ref<string | null>(null)
const decisionsPartial = ref(false)
const syncStatus = ref({ realmReachable: true, lastSyncMs: null as number | null })

const passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const ChipsStub = defineComponent({
  props: { options: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h('div', (props.options as Array<{ label: string; count: number }>).map((option) => h('span', `${option.label} ${option.count}`))),
})

let ActivityView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: passthrough }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/ui/FilterChips.vue', () => ({ default: ChipsStub }))
  vi.doMock('@/components/ui/Skeleton.vue', () => ({ default: passthrough }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => ({
    default: defineComponent((_, { slots }) => () => h('div', [slots.actions?.()])),
  }))
  vi.doMock('@/composables/useRealm', () => ({ useRealm: () => ({ realm: ref({ name: 'Test realm' }) }) }))
  vi.doMock('@/composables/useSyncedFolders', () => ({
    useSyncedFolders: () => ({
      folders,
      listState: foldersState,
      listError: ref(null),
      ensureLoaded: vi.fn(async () => undefined),
      setPaused: vi.fn(),
      sync: vi.fn(),
    }),
  }))
  vi.doMock('@/composables/useDeviceTransfers', () => ({
    useDeviceTransfers: () => ({ all: transfers, state: transfersState, error: ref(null), load: vi.fn(async () => undefined) }),
  }))
  vi.doMock('@/composables/useDeviceSync', () => ({
    useDeviceSync: () => ({ status: syncStatus, runSync: vi.fn(), load: vi.fn(async () => undefined) }),
  }))
  vi.doMock('@/composables/useFolderDecisions', () => ({
    useFolderDecisions: () => ({ items: decisionItems, partial: decisionsPartial, state: decisionsState, error: decisionsError, load: vi.fn(async () => undefined) }),
  }))
  ActivityView = (await import('./ActivityView.vue')).default
})

const transfer = (id: string, state: string, extra: Record<string, unknown> = {}) =>
  readTransfer({ id, state, path: `run/${id}.gz`, folder_id: 'f1', bytes_total: 100, bytes_done: 40, ...extra }, 'upload')

beforeEach(() => {
  folders.value = [readFolder({ folder_id: 'f1', root: '/home/me/Lab/Sequencing runs' })]
  foldersState.value = 'ready'
  transfers.value = []
  transfersState.value = 'ready'
  decisionItems.value = []
  decisionsPartial.value = false
  decisionsState.value = 'ready'
  decisionsError.value = null
  syncStatus.value = { realmReachable: true, lastSyncMs: null }
})

const render = () => renderToString(createSSRApp(ActivityView))

describe('activity', () => {
  it('counts what moves, what failed and what is done from the node list', async () => {
    transfers.value = [
      transfer('a', 'transferring'),
      transfer('b', 'transferring'),
      transfer('c', 'failed', { message: 'The connection to Giessen was lost.' }),
      transfer('d', 'done'),
    ]
    const html = await render()

    expect(html).toContain('moving now')
    expect(html).toContain('Sequencing runs')
    expect(html).toContain('2 moving · 1 failed · 1 done')
    expect(html).toContain('The connection to Giessen was lost.')
    expect(html).toContain('Retry')
    expect(html).toContain('All 4')
    expect(html).toContain('In progress 2')
  })

  it('shows total progress only from counted bytes', async () => {
    transfers.value = [transfer('a', 'transferring'), transfer('b', 'transferring')]
    expect(await render()).toContain('Total progress')

    transfers.value = [transfer('a', 'running', { bytes_done: 0 })]
    expect(await render()).not.toContain('Total progress')
  })

  it('lists the decisions under their folder', async () => {
    decisionItems.value = [{ folderId: 'f1', folder: 'Sequencing runs', text: 'Kept your version of samplesheet.csv', atMs: null, outcome: 'applied' }]
    const html = await render()

    expect(html).toContain('Decisions')
    expect(html).toContain('Kept your version of samplesheet.csv')
    expect(html).toContain('Decisions 1')
  })

  it('says when the decision list may be incomplete', async () => {
    decisionsPartial.value = true

    expect(await render()).toContain('Some folders did not report their decisions')
  })

  it('names the realm check without inventing a time', async () => {
    const html = await render()

    expect(html).toContain('Last check: never · Test realm is reachable')
  })

  it('explains an absent node instead of showing empty counts', async () => {
    foldersState.value = 'offline'
    const html = await render()

    expect(html).toContain('not running')
    expect(html).not.toContain('moving now')
  })

  it('shows an idle folder under All', async () => {
    const html = await render()

    expect(html).toContain('Nothing is moving in this folder.')
  })

  it('tells loading, unavailable and failed decisions apart from none decided', async () => {
    decisionsState.value = 'loading'
    expect(await render()).toContain('Reading your decisions…')

    decisionsState.value = 'unsupported'
    expect(await render()).toContain('does not keep a history of decisions yet')

    decisionsState.value = 'error'
    decisionsError.value = 'the node is busy'
    const failed = await render()
    expect(failed).toContain('Your decisions could not be read: the node is busy')
    expect(failed).toContain('Try again')
    // No count is claimed while the decisions are unknown.
    expect(failed).not.toContain('Decisions 0')
    expect(failed).not.toContain('All 0')

    decisionsState.value = 'ready'
    expect(await render()).toContain('Decisions 0')
  })
})
