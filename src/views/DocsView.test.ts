import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { docsScreenshots, docsTopics } from '@/docs/v1'

const route = { params: { topic: '' } }
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup(_, { slots }) {
    return () => h('a', slots.default?.())
  },
})
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('header', [h('h1', props.title), h('p', props.description), slots.breadcrumbs?.(), slots.actions?.()])
  },
})
const ButtonStub = defineComponent((_, { slots }) => () => h('button', slots.default?.()))
const EmptyStateStub = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('section', [h('h2', props.title), h('p', props.description), slots.default?.()])
  },
})

let DocsView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: RouterLinkStub, useRoute: () => route }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => ({ default: PageHeaderStub }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/EmptyState.vue', () => ({ default: EmptyStateStub }))
  DocsView = (await import('./DocsView.vue')).default
})

async function renderTopic(slug: string): Promise<string> {
  route.params.topic = slug
  return renderToString(createSSRApp(DocsView))
}

describe('versioned in-portal Docs', () => {
  it('renders every declared concept and task-guide topic', async () => {
    expect(docsTopics.map((topic) => topic.slug)).toEqual([
      'datasets',
      'profiles-conformance',
      'data-and-deletion',
      'realm-nodes-groups',
      'storage-access',
      'states-and-retry',
      'identifiers',
      'first-dataset',
      'storage-backend',
      'cli-access-key',
      'compute-run',
    ])

    for (const topic of docsTopics) {
      const html = await renderTopic(topic.slug)
      expect(html).toContain(topic.title)
      expect(html).toContain(topic.summary)
      for (const section of topic.sections) expect(html).toContain(section.title)
    }
  })

  it('records screenshot work as deferred without placeholder content', async () => {
    const html = await renderTopic('')

    expect(docsScreenshots.status).toBe('deferred')
    expect(html).toContain('Screenshot status:')
    expect(html).toContain(docsScreenshots.note)
    expect(JSON.stringify(docsTopics)).not.toMatch(/lorem ipsum/i)
  })

  it('renders an honest unknown-topic state', async () => {
    const html = await renderTopic('not-a-topic')
    expect(html).toContain('Docs topic not found')
    expect(html).toContain('current versioned guide')
  })
})
