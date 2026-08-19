import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
let FederationPanel: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    useRouter: () => ({ push: vi.fn() }),
  }))
  vi.doMock('@vueuse/core', () => ({ useNow: () => ref(new Date(0)) }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: BadgeStub }))
  FederationPanel = (await import('./FederationPanel.vue')).default
})

async function renderReplication(replicationFactor?: number | null): Promise<string> {
  const app = createSSRApp({
    render: () => h(FederationPanel, { nodes: [], replicationFactor }),
  })
  const html = await renderToString(app)
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('replication policy rendering', () => {
  it('renders a null default as all eligible nodes', async () => {
    const text = await renderReplication(null)
    expect(text).toContain('replication all eligible nodes')
    expect(text).not.toContain('replication ×1')
  })

  it('renders an absent default as unknown', async () => {
    expect(await renderReplication()).toContain('replication unknown')
  })
})
