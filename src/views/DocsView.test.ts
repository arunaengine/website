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
  it('renders every declared concept and how-to topic', async () => {
    expect(docsTopics.map((topic) => topic.slug)).toEqual([
      'datasets',
      'profiles-conformance',
      'data-and-deletion',
      'realm-nodes-groups',
      'storage-access',
      'states-and-retry',
      'identifiers',
      'data-to-compute',
      'portal-tour',
      'first-group',
      'upload-data',
      'first-dataset',
      'compute-run',
      'storage-backend',
      'cli-access-key',
      'assistant',
    ])

    for (const topic of docsTopics) {
      const html = await renderTopic(topic.slug)
      expect(html).toContain(topic.title)
      expect(html).toContain(topic.summary)
      for (const section of topic.sections) expect(html).toContain(section.title)
    }
  })

  it('ships walkthrough screenshots', async () => {
    const html = await renderTopic('')

    expect(docsScreenshots.status).toBe('available')
    expect(html).toContain('Screenshot status:')
    expect(html).toContain(docsScreenshots.note)
    expect(JSON.stringify(docsTopics)).not.toMatch(/lorem ipsum/i)

    const images = docsTopics.flatMap((topic) => topic.sections.flatMap((s) => (s.image ? [s.image] : [])))
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      expect(image.src).toMatch(/^\/docs\/v1\/[a-z0-9-]+\.jpg$/)
      expect(image.alt.length).toBeGreaterThan(0)
    }

    const tourHtml = await renderTopic('portal-tour')
    expect(tourHtml).toContain('<figure')
    expect(tourHtml).toContain('/docs/v1/dashboard.jpg')
  })

  it('offers a guided tour only on the guides that declare one', async () => {
    expect(docsTopics.filter((topic) => topic.tour).map((topic) => topic.slug)).toEqual([
      'portal-tour',
      'first-group',
      'upload-data',
      'first-dataset',
      'compute-run',
      'storage-backend',
      'cli-access-key',
      'assistant',
    ])
    expect(await renderTopic('portal-tour')).toContain('Show me in the portal')
    expect(await renderTopic('datasets')).not.toContain('Show me in the portal')
  })

  it('walks real app routes and kebab-case anchors', () => {
    for (const step of docsTopics.flatMap((topic) => topic.tour ?? [])) {
      expect(step.route.startsWith('/app')).toBe(true)
      expect(step.anchor).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
  })

  it('states the activated RO-Crate compatibility and 1.2 creation default', () => {
    const datasets = docsTopics.find((topic) => topic.slug === 'datasets')
    const copy = JSON.stringify(datasets)

    expect(copy).toContain('RO-Crate 1.2 and 1.3 are supported for import, validation, and round-trip export.')
    expect(copy).toContain('New portal-authored datasets currently emit RO-Crate 1.2.')
  })

  it('renders an honest unknown-topic state', async () => {
    const html = await renderTopic('not-a-topic')
    expect(html).toContain('Docs topic not found')
    expect(html).toContain('current versioned guide')
  })
})
