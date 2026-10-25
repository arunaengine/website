import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStatus, type NodeStatus } from '@/lib/desktopBridge'

const status = ref<NodeStatus | null>(null)
const startNode = vi.fn()
const pauseNode = vi.fn()

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))

let NodePanel: Component

beforeAll(async () => {
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: BadgeStub }))
  vi.doMock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ status, error: ref(null) }) }))
  vi.doMock('@/composables/useNodeControl', () => ({
    useNodeControl: () => ({ busy: ref(false), error: ref(null), start: startNode, pause: pauseNode }),
  }))
  vi.doMock('@/composables/useRealm', () => ({ useRealm: () => ({ realm: ref({ name: 'Test realm' }) }) }))
  vi.doMock('@/lib/desktopBridge', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/desktopBridge')>()),
    nodeSettings: async () => ({ paused: false }),
  }))
  NodePanel = (await import('./NodePanel.vue')).default
})

beforeEach(() => {
  status.value = readStatus({
    state: 'running',
    ready: true,
    enrolled: true,
    version: '3.0.0-alpha.131',
    uptimeSeconds: 2 * 86400 + 4 * 3600,
  })
})

const render = () => renderToString(createSSRApp(NodePanel))

describe('the status card', () => {
  it('tells a running node in plain words and offers a pause', async () => {
    const html = await render()

    expect(html).toContain('Running')
    expect(html).toContain('Syncing, tools and local runs are working.')
    expect(html).toContain('2 days 4 hours')
    expect(html).toContain('3.0.0-alpha.131')
    expect(html).toContain('Test realm')
    expect(html).toContain('Pause')
    expect(html).not.toContain('Restart')
  })

  it('offers Start for a stopped node and keeps the shell reason', async () => {
    status.value = readStatus({ state: 'stopped', enrolled: true, message: 'The node was stopped.' })
    const html = await render()

    expect(html).toContain('Stopped')
    expect(html).toContain('Aruna is not running.')
    expect(html).toContain('The node was stopped.')
    expect(html).toContain('Start')
    expect(html).not.toContain('Pause')
  })

  it('claims no uptime before the node answers', async () => {
    status.value = readStatus({ state: 'running', ready: false, enrolled: true, uptimeSeconds: 99999 })
    const html = await render()

    expect(html).toContain('Starting')
    expect(html).not.toContain('1 day')
  })

  it('says a computer that joined no realm has not', async () => {
    status.value = readStatus({ state: 'running', ready: true, enrolled: false })

    expect(await render()).toContain('has not joined a realm yet')
  })
})
