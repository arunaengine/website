import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const status = ref<{ enrolled: boolean } | null>(null)
const loaded = ref(true)
const panel = (name: string) => ({ default: defineComponent(() => () => h('section', { 'data-panel': name })) })

let DeviceView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => panel('header'))
  vi.doMock('@/components/device/EnrollPanel.vue', () => panel('enroll'))
  vi.doMock('@/components/device/NodePanel.vue', () => panel('status'))
  vi.doMock('@/components/desktop/LinkedFolders.vue', () => panel('folders'))
  vi.doMock('@/components/desktop/ActivityCard.vue', () => panel('activity'))
  vi.doMock('@/components/device/ComputePanel.vue', () => panel('runs'))
  vi.doMock('@/components/device/LocalPanel.vue', () => panel('storage'))
  vi.doMock('@/components/desktop/LocalBuckets.vue', () => panel('buckets'))
  vi.doMock('@/components/device/WipePanel.vue', () => panel('wipe'))
  vi.doMock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ status, loaded, refresh: vi.fn() }) }))
  vi.doMock('@/composables/useEnrollWatch', () => ({
    useEnrollWatch: () => ({ invite: ref(null), start: vi.fn(), clear: vi.fn() }),
  }))
  DeviceView = (await import('./DeviceView.vue')).default
})

beforeEach(() => {
  status.value = { enrolled: true }
})

const render = () => renderToString(createSSRApp(DeviceView))

describe('the this computer page', () => {
  it('leads with status, folders and activity, then the settings in a two-column grid', async () => {
    const html = await render()
    const at = (marker: string) => html.indexOf(marker)
    const order = ['status', 'folders', 'activity', 'runs', 'storage', 'buckets', 'wipe'].map((name) =>
      at(`data-panel="${name}"`),
    )

    expect(order.every((index, position) => index > (order[position - 1] ?? -1))).toBe(true)
    expect(at('Settings for this computer')).toBeGreaterThan(at('data-panel="activity"'))
    expect(at('Settings for this computer')).toBeLessThan(at('data-panel="runs"'))
    expect(at('lg:grid-cols-2')).toBeLessThan(at('data-panel="runs"'))
    expect(html).not.toContain('data-panel="enroll"')
  })

  it('keeps the anchors that other pages link to', async () => {
    const html = await render()

    expect(html).toMatch(/id="local-runs"[^>]*data-panel="runs"|data-panel="runs"[^>]*id="local-runs"/)
    expect(html).toMatch(/id="wipe"[^>]*data-panel="wipe"|data-panel="wipe"[^>]*id="wipe"/)
  })

  it('shows the enroll panel first until the computer has joined', async () => {
    status.value = { enrolled: false }
    const html = await render()

    expect(html.indexOf('data-panel="enroll"')).toBeGreaterThan(-1)
    expect(html.indexOf('data-panel="enroll"')).toBeLessThan(html.indexOf('data-panel="status"'))
  })
})
