import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ActivityGroups from '@/lib/activityGroups'
import * as DeviceApi from '@/lib/deviceApi'
import * as StateBadge from '@/lib/stateBadge'
import * as SyncStates from '@/lib/syncStates'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

type Client = { baseUrl: string; token: string }
const clientA: Client = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'a' }
const clientB: Client = { baseUrl: 'http://127.0.0.1:9001/api/v1', token: 'b' }

const { deviceClient, folders } = await vi.hoisted(async () => {
  const { ref: make } = await import('vue')
  return {
    deviceClient: make<{ baseUrl: string; token: string } | null>(null),
    folders: make<unknown[]>([]),
  }
})
const actionLog = vi.fn()

vi.mock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ deviceClient }) }))
vi.mock('@/composables/useSyncedFolders', () => ({ useSyncedFolders: () => ({ folders, actionLog }) }))

const RealDecisions = await import('@/composables/useFolderDecisions')

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const Empty = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const ActivityCard = compileClientComponent(new URL('./ActivityCard.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/FilterChips.vue': moduleDefault(Empty),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Progress.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/desktop/DeviceSurfaceState.vue': moduleDefault(Empty),
  '@/composables/useDeviceSync': {
    useDeviceSync: () => ({ status: ref({ realmReachable: true, lastSyncMs: null }), runSync: vi.fn(), load: vi.fn(async () => undefined) }),
  },
  '@/composables/useDeviceTransfers': {
    useDeviceTransfers: () => ({ all: ref([]), state: ref('ready'), error: ref(null), load: vi.fn(async () => undefined) }),
  },
  '@/composables/useFolderDecisions': RealDecisions,
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ name: 'Test realm' }) }) },
  '@/composables/useSyncedFolders': {
    useSyncedFolders: () => ({
      folders,
      listState: ref('ready'),
      listError: ref(null),
      ensureLoaded: vi.fn(async () => undefined),
      setPaused: vi.fn(),
      sync: vi.fn(),
    }),
  },
  '@/lib/activityGroups': ActivityGroups,
  '@/lib/deviceApi': DeviceApi,
  '@/lib/stateBadge': StateBadge,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

beforeEach(() => {
  actionLog.mockReset()
  folders.value = [DeviceApi.readFolder({ folder_id: 'f1', root: '/home/me/Runs' })]
  deviceClient.value = clientA
})

describe('the mounted Activity card when the device changes', () => {
  it('reads the decisions again for the new client instead of waiting for ever', async () => {
    const slow = deferred<DeviceApi.ActionRecord[]>()
    actionLog
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValue([DeviceApi.readAction({ action: 'keep_local', path: 'new.csv', at_ms: 20 })])
    const mounted = await mountApp(ActivityCard)
    await vi.waitFor(() => expect(content(mounted.root)).toContain('Reading your decisions…'))

    deviceClient.value = clientB
    await vi.waitFor(() => expect(content(mounted.root)).toContain('Kept your version of new.csv'))
    slow.resolve([DeviceApi.readAction({ action: 'keep_local', path: 'old.csv', at_ms: 10 })])
    await Promise.resolve()

    expect(content(mounted.root)).not.toContain('Reading your decisions…')
    expect(content(mounted.root)).not.toContain('old.csv')
    mounted.app.unmount()
  })

  it('says unavailable while the device is gone and recovers when it returns', async () => {
    actionLog.mockResolvedValue([DeviceApi.readAction({ action: 'keep_local', path: 'a.csv', at_ms: 10 })])
    const mounted = await mountApp(ActivityCard)
    await vi.waitFor(() => expect(content(mounted.root)).toContain('Kept your version of a.csv'))

    deviceClient.value = null
    await vi.waitFor(() => expect(content(mounted.root)).toContain('Your decisions could not be read'))
    expect(content(mounted.root)).not.toContain('Kept your version of a.csv')

    deviceClient.value = clientB
    await vi.waitFor(() => expect(content(mounted.root)).toContain('Kept your version of a.csv'))
    mounted.app.unmount()
  })
})
