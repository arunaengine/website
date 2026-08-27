import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocationAggregate } from '@/lib/placement'

const source = readFileSync(fileURLToPath(new URL('./StatusView.vue', import.meta.url)), 'utf8')

const realm = ref({ id: 'realm-id', name: 'Test realm', description: 'Public research data', color: '#08216C' })
const realmInfo = ref<Record<string, any> | null>(null)
const nodeInfo = ref<Record<string, unknown> | null>(null)
const usageInfo = ref<Record<string, unknown> | null>(null)
const currentUser = ref<Record<string, unknown> | null>(null)
const apiBaseUrl = ref('http://127.0.0.1:8080/api/v1')
const loadInfo = vi.fn(async () => undefined)

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent({
  props: { variant: String },
  setup: (_, { slots }) => () => h('span', slots.default?.()),
})
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), slots.actions?.()]),
})
const AggregatesStub = defineComponent({
  props: { aggregates: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h('div', (props.aggregates as LocationAggregate[]).map((a) => `${a.location}=${a.nodeCount}`).join(' ')),
})

let StatusView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
  vi.doMock('@/composables/useAruna', () => ({
    useAruna: () => ({ realm, realmInfo, nodeInfo, usageInfo, currentUser, apiBaseUrl, loadInfo }),
  }))
  vi.doMock('@vueuse/core', () => ({
    useDocumentVisibility: () => ref('hidden'),
    useIntervalFn: () => ({ pause: vi.fn(), resume: vi.fn() }),
  }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => ({ default: PageHeaderStub }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: BadgeStub }))
  vi.doMock('@/components/nodes/CopyButton.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/nodes/LocalNodeDetails.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/nodes/NodeDetailPanel.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/placement/LocationAggregates.vue', () => ({ default: AggregatesStub }))
  StatusView = (await import('./StatusView.vue')).default
})

beforeEach(() => {
  realmInfo.value = { metadata_replication: { default_replication_factor: 2 }, nodes: [] }
  nodeInfo.value = null
  usageInfo.value = null
  currentUser.value = null
  loadInfo.mockClear()
})

async function renderedText(): Promise<string> {
  const html = await renderToString(createSSRApp(StatusView))
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('node outage presentation', () => {
  it('requires a failed browser probe instead of treating configured DHT state as an outage', () => {
    const predicate = source.match(/const unreachableNodes = computed\([\s\S]*?\n\)/)?.[0] ?? ''

    expect(predicate).toContain("probeFor(node)?.state === 'unreachable'")
    expect(predicate).not.toContain('node.configured')
    expect(predicate).not.toContain('connection_status')
    expect(source).toContain('The browser API probe failed')
    expect(source).toContain('present in DHT')
  })
})

describe('device summary', () => {
  it('summarizes user nodes instead of listing them among realm nodes', async () => {
    currentUser.value = { id: 'user-1' }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 2 },
      nodes: [
        {
          node_id: 'server-node',
          kind: 'server',
          configured: true,
          present: true,
          connection_status: 'connected',
          placement: { location: 'eu-west', weight: 1, full: false, draining: false },
        },
        {
          node_id: 'laptop-alpha',
          kind: 'user',
          owner: 'user-1',
          configured: true,
          present: false,
          connection_status: 'seen',
          last_seen_ms: Date.now() - 4 * 60_000,
        },
        { node_id: 'laptop-beta', kind: 'user', owner: 'user-2', configured: true, present: false, connection_status: 'unknown' },
      ],
    }

    const text = await renderedText()

    expect(text).toContain('Devices')
    expect(text).toContain('2 enrolled, 1 active')
    expect(text).toContain('last seen 4m ago')
    expect(text).toContain('Devices do not announce themselves to the realm')
    expect(text).toContain('1 yours')
    expect(text).toContain('server-node')
    expect(text).not.toContain('laptop-')
    expect(text).not.toContain('user-2')
    // Devices are owner-bound machines: they stay out of the placement buckets.
    expect(text).toContain('eu-west=1')
    expect(text).not.toContain('(not in placement map)')
    expect(text).toContain('1 / 1 present in DHT')
  })

  it('claims no activity for a device it has never heard from', async () => {
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 2 },
      nodes: [
        { node_id: 'server-node', kind: 'server', configured: true, present: true, connection_status: 'connected' },
        { node_id: 'laptop-gamma', kind: 'user', owner: 'user-3', configured: true, present: false, connection_status: 'unknown' },
      ],
    }

    const text = await renderedText()

    expect(text).toContain('1 enrolled, 0 active')
    expect(text).not.toContain('last seen')
  })

  it('renders no device summary for a realm without devices', async () => {
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 2 },
      nodes: [{ node_id: 'server-node', kind: 'server', configured: true, present: true, connection_status: 'connected' }],
    }

    const text = await renderedText()

    expect(text).not.toContain('Devices')
    expect(text).not.toContain('enrolled')
  })
})
