import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { docsScreenshots, docsTopics } from '@/docs/v1'
import { navAnchor, navEntries } from '@/components/layout/nav'

// Every source file that can carry a data-tour anchor.
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(entry.name) ? [path] : []
  })
}

const route = { params: { topic: '' } }
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true }, custom: Boolean },
  setup(props, { slots }) {
    const href = typeof props.to === 'string' ? props.to : JSON.stringify(props.to)
    return () => (props.custom ? slots.default?.({ href, navigate: () => {} }) : h('a', slots.default?.()))
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
    // Guides lead; the concept wiki follows, glossary last as the long tail.
    expect(docsTopics.map((topic) => topic.slug)).toEqual([
      'portal-tour',
      'first-group',
      'upload-data',
      'where-data-lives',
      'first-dataset',
      'build-a-profile',
      'compute-run',
      'storage-backend',
      'cli-access-key',
      'assistant',
      'datasets',
      'realm-nodes-groups',
      'data-and-deletion',
      'profiles-conformance',
      'identifiers',
      'storage-access',
      'states-and-retry',
      'data-to-compute',
      'glossary',
    ])

    for (const topic of docsTopics) {
      const html = await renderTopic(topic.slug)
      expect(html).toContain(topic.title)
      expect(html).toContain(topic.summary)
      for (const section of topic.sections) expect(html).toContain(section.title)
      expect(html).not.toContain('](')
    }
  })

  it('shows an orienting home', async () => {
    // Home: intro, the tour as entry point, the inline SVG map, group cards.
    const html = await renderTopic('')

    expect(html).toContain('every term the portal uses')
    expect(html).toContain('Find your way around')
    expect(html).toContain('docs-map-title')
    expect(html).toContain('one RO-Crate bundle')
    expect(html).toContain('query · validate · share')
    expect(html.indexOf('How-to guides')).toBeGreaterThan(-1)
    expect(html.indexOf('How-to guides')).toBeLessThan(html.indexOf('Concepts &amp; glossary'))
  })

  it('banners the API reference', async () => {
    // Both the home and every topic carry the portal-vs-REST banner.
    for (const slug of ['', 'datasets']) {
      const html = await renderTopic(slug)
      expect(html).toContain('This is the portal documentation.')
      expect(html).toContain('Open the API reference')
    }
    expect(await renderTopic('')).toContain('REST API')
  })

  it('anchors every section', async () => {
    // Slugified heading ids make sections directly linkable.
    const html = await renderTopic('data-and-deletion')
    expect(html).toContain('id="buckets-hold-the-bytes"')
    expect(html).toContain('id="delete-is-recoverable"')
    expect(html).toContain('id="every-write-keeps-a-version"')
    expect(html).toContain('id="delete-permanently-is-separate"')
    expect(html).toContain('aria-label="Link to this section"')
  })

  it('defines glossary terms', async () => {
    // The wiki's long tail: one linkable section per term.
    const html = await renderTopic('glossary')
    for (const term of ['role', 'run-family', 'canonical-execution', 'delete-marker', 'quota', 'mcp']) {
      expect(html).toContain(`id="${term}"`)
    }
  })

  it('renders inline links safely', async () => {
    // External links open in a new tab; no raw [label](target) syntax leaks.
    const html = await renderTopic('datasets')
    expect(html).toContain('href="https://www.researchobject.org/ro-crate/"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('](')
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
      expect(image.src).toMatch(/^\/docs\/v1\/[a-z0-9-]+\.(jpg|svg)$/)
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
      'build-a-profile',
      'compute-run',
      'storage-backend',
      'cli-access-key',
      'assistant',
    ])
    expect(await renderTopic('portal-tour')).toContain('Show me in the portal')
    expect(await renderTopic('datasets')).not.toContain('Show me in the portal')
  })

  it('spotlights anchors the portal actually renders', () => {
    // A tour stop whose anchor no components carries would spotlight nothing.
    const rendered = new Set<string>()
    const sourceRoot = fileURLToPath(new URL('..', import.meta.url))
    for (const file of sourceFiles(sourceRoot)) {
      const text = readFileSync(file, 'utf8')
      if (!text.includes('data-tour')) continue
      for (const match of text.matchAll(/data-tour="([a-z0-9-]+)"/g)) rendered.add(match[1])
      // A bound anchor (:data-tour) comes from a map in the same file.
      for (const match of text.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)+)'/g)) rendered.add(match[1])
    }
    // The sidebar derives its anchors from the one nav definition.
    for (const entry of navEntries({ desktop: true, isRealmAdmin: true, canInspectUsers: true, assistant: true })) {
      if ('separator' in entry) continue
      rendered.add(navAnchor(entry.label))
    }

    for (const step of docsTopics.flatMap((topic) => topic.tour ?? [])) {
      expect(rendered.has(step.anchor), `${step.anchor} (${step.title})`).toBe(true)
    }
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
