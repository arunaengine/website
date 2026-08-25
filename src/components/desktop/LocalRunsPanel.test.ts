import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClientOptions } from '@/lib/api'

const deviceClient = ref<{ baseUrl: string; token: string } | null>(null)
const compute = ref<{ enabled: boolean } | null>(null)

// Whatever the panel handed useJobsList, so the wiring itself can be checked.
let listOptions: { client?: () => ApiClientOptions; pollWhile?: () => boolean } = {}
const load = vi.fn(async () => undefined)

const EmptyStub = defineComponent(() => () => null)
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
const SurfaceStateStub = defineComponent({
  props: { state: String, subject: String },
  setup: (props) => () => h('div', `surface:${props.state}:${props.subject}`),
})

let LocalRunsPanel: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    useRoute: () => ({ name: 'runs', params: {} }),
    useRouter: () => ({ push: vi.fn() }),
  }))
  vi.doMock('@/composables/useJobs', () => ({
    JOB_CLIENT: Symbol('aruna.jobClient'),
    useJobsList: (options: typeof listOptions) => {
      listOptions = options
      return {
        jobs: ref([]),
        listState: ref('idle'),
        listError: ref(null),
        refreshing: ref(false),
        nextCursor: ref(null),
        load,
        loadMore: vi.fn(),
      }
    },
  }))
  vi.doMock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ deviceClient }) }))
  vi.doMock('@/composables/useDeviceCompute', () => ({
    useDeviceCompute: () => ({ compute, ensureLoaded: vi.fn(async () => undefined) }),
  }))
  vi.doMock('@/components/desktop/DeviceSurfaceState.vue', () => ({ default: SurfaceStateStub }))
  vi.doMock('@/components/jobs/JobDetailPanel.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/jobs/JobStateBadge.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/EmptyState.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/ErrorPanel.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/Progress.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/Skeleton.vue', () => ({ default: EmptyStub }))
  LocalRunsPanel = (await import('./LocalRunsPanel.vue')).default
})

beforeEach(() => {
  deviceClient.value = null
  compute.value = null
  listOptions = {}
  load.mockClear()
})

function render(): Promise<string> {
  return renderToString(createSSRApp(LocalRunsPanel))
}

describe('local runs', () => {
  it('refuses to list anything when this machine has no node', async () => {
    // Falling back to the realm base would show realm jobs as local runs.
    const html = await render()

    expect(html).toContain('surface:offline:its runs')
    expect(() => listOptions.client?.()).toThrow(/not running/)
    expect(listOptions.pollWhile?.()).toBe(false)
  })

  it('talks to the local node API once it is up', async () => {
    deviceClient.value = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' }

    const html = await render()

    expect(listOptions.client?.()).toEqual({ baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' })
    expect(listOptions.pollWhile?.()).toBe(true)
    expect(html).not.toContain('surface:offline')
  })

  it('says so when running jobs here is switched off', async () => {
    deviceClient.value = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' }
    compute.value = { enabled: false }

    expect(await render()).toContain('switched off')
  })
})
