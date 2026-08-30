import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as GraphIri from '@/lib/graphIri'
import * as Pid from '@/lib/pid'
import * as Refresh from '@/composables/useRefresh'
import * as Utils from '@/lib/utils'

const PID = 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV'
const listPersistentIds = vi.fn(async () => [view('requested')])

function view(state: Pid.PersistentIdState): Pid.PersistentIdView {
  return {
    kind: 'pid',
    provider: 'w3id',
    value: PID,
    state,
    document_id: 'dataset-1',
    job_id: null,
    failure: null,
    requested_at_ms: null,
    minted_at_ms: null,
    withdrawn_at_ms: null,
  }
}

const EmptyStub = defineComponent(() => () => null)
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))

const PersistentIdSection = compileClientComponent(
  new URL('./PersistentIdSection.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
    '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
    '@/components/ui/CopyButton.vue': moduleDefault(EmptyStub),
    '@/components/ui/ExternalLink.vue': moduleDefault(EmptyStub),
    '@/components/ui/RefreshButton.vue': moduleDefault(EmptyStub),
    '@/components/ui/Skeleton.vue': moduleDefault(EmptyStub),
    '@/composables/useAruna': {
      useAruna: () => ({
        apiBaseUrl: ref('https://api.example.test'),
        authToken: ref('token'),
        currentUser: ref({ id: 'user-1' }),
      }),
    },
    '@/composables/useRefresh': Refresh,
    '@/lib/api': Api,
    '@/lib/graphIri': GraphIri,
    '@/lib/pid': { ...Pid, listPersistentIds },
    '@/lib/utils': Utils,
  },
)

function mount() {
  return mountApp(PersistentIdSection, { props: { documentId: 'dataset-1', isPublic: true } })
}

async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers()
  listPersistentIds.mockReset().mockResolvedValue([view('requested')])
})

afterEach(() => vi.useRealTimers())

describe('PersistentIdSection polling', () => {
  it('re-checks a registering identifier and stops once it is active', async () => {
    listPersistentIds.mockResolvedValueOnce([view('requested')]).mockResolvedValue([view('active')])
    const mounted = await mount()

    expect(listPersistentIds).toHaveBeenCalledTimes(1)
    await tick(2999)
    expect(listPersistentIds).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(listPersistentIds).toHaveBeenCalledTimes(2)
    expect(content(mounted.root)).toContain('Active')

    await tick(60000)
    expect(listPersistentIds).toHaveBeenCalledTimes(2)
    mounted.app.unmount()
  })

  it('doubles the delay between two pending answers', async () => {
    const mounted = await mount()

    await tick(3000)
    expect(listPersistentIds).toHaveBeenCalledTimes(2)
    await tick(5999)
    expect(listPersistentIds).toHaveBeenCalledTimes(2)
    await tick(1)
    expect(listPersistentIds).toHaveBeenCalledTimes(3)
    mounted.app.unmount()
  })

  it('stops on unmount', async () => {
    const mounted = await mount()
    mounted.app.unmount()

    await tick(30000)
    expect(listPersistentIds).toHaveBeenCalledTimes(1)
  })

  it('retries a failed read once at the cap', async () => {
    listPersistentIds.mockRejectedValue(new Error('gateway down'))
    const mounted = await mount()

    await tick(3000)
    expect(listPersistentIds).toHaveBeenCalledTimes(1)
    await tick(12000)
    expect(listPersistentIds).toHaveBeenCalledTimes(2)
    await tick(60000)
    expect(listPersistentIds).toHaveBeenCalledTimes(2)
    mounted.app.unmount()
  })
})
