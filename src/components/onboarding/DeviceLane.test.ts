import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const PassThrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const InputStub = defineComponent((_, { attrs }) => () => h('input', attrs))
const SelectStub = defineComponent((_, { attrs }) => () => h('select', attrs))
let DeviceLane: Component

beforeAll(async () => {
  for (const path of ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent', 'Button']) {
    vi.doMock(`@/components/ui/${path}.vue`, () => ({ default: PassThrough }))
  }
  vi.doMock('@/components/ui/Input.vue', () => ({ default: InputStub }))
  vi.doMock('@/components/ui/Select.vue', () => ({ default: SelectStub }))
  DeviceLane = (await import('./DeviceLane.vue')).default
})

async function render(step: number): Promise<string> {
  const html = await renderToString(createSSRApp({ render: () => h(DeviceLane, { step }) }))
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('DeviceLane', () => {
  it('marks every step as not yet available', async () => {
    for (const step of [1, 2, 3]) {
      expect(await render(step)).toContain('Coming with device enrollment')
    }
  })

  it('offers all four hand-off routes', async () => {
    const text = await render(2)
    for (const tab of ['Open in Aruna Desktop', 'QR', 'Paste', 'Headless env']) {
      expect(text).toContain(tab)
    }
    expect(text).toContain('The QR appears with the token')
  })

  it('renders the headless env with a token placeholder', async () => {
    // The snippet must come from buildDeviceEnv, never from hand-written copy.
    const text = await render(2)
    expect(text).toContain('ONBOARDING_SECRET=&lt;device-token&gt;')
    expect(text).toContain('STORAGE_PATH=/data')
  })
})
