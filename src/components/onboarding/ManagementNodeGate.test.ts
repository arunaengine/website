import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const PassThrough = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const PORTALS = [{ id: 'n1', url: 'https://mgmt.test' }]

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl: ref('https://server.test/api/v1') }),
}))

async function text(gate: Component, portals = PORTALS): Promise<string> {
  const markup = await renderToString(createSSRApp({ render: () => h(gate, { portals }) }))
  return markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('management node gate', () => {
  let onWeb: Component
  let inShell: Component

  beforeAll(async () => {
    vi.doMock('@/components/ui/Button.vue', () => ({ default: PassThrough }))
    onWeb = (await import('./ManagementNodeGate.vue')).default
    // The desktop context is read once per module graph, so the gate is
    // imported again with the shell's global in place.
    vi.resetModules()
    vi.doMock('@/components/ui/Button.vue', () => ({ default: PassThrough }))
    Object.assign(globalThis, { window: globalThis, __ARUNA_DESKTOP__: { apiBaseUrl: '/api/v1' } })
    inShell = (await import('./ManagementNodeGate.vue')).default
  })

  it('names the node that refused', async () => {
    expect(await text(onWeb)).toContain('https://server.test is not one')
  })

  it('links the portals on the web', async () => {
    const markup = await renderToString(createSSRApp({ render: () => h(onWeb, { portals: PORTALS }) }))
    expect(markup).toContain('href="https://mgmt.test"')
    expect(markup).not.toContain('Switch')
  })

  it('offers to switch inside the shell', async () => {
    const rendered = await text(inShell)
    expect(rendered).toContain('Switch Aruna Desktop to a management node')
    expect(rendered).toContain('sign in again')
  })

  it('points at an administrator without portals', async () => {
    expect(await text(onWeb, [])).toContain('A realm administrator knows the address')
  })
})
