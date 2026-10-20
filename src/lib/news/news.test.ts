import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { newsPosts, renderPost, type NewsPost } from './posts'

const route = { params: {} as Record<string, string> }
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))

let NewsView: Component
let NewsPostView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: RouterLinkStub, useRoute: () => route }))
  vi.doMock('@/components/landing/LandingNav.vue', () => ({ default: defineComponent(() => () => h('header')) }))
  vi.doMock('@/components/landing/LandingFooter.vue', () => ({ default: defineComponent(() => () => h('footer')) }))
  NewsView = (await import('@/views/NewsView.vue')).default
  NewsPostView = (await import('@/views/NewsPostView.vue')).default
})

async function renderSlug(slug: string): Promise<string> {
  route.params = { slug }
  return renderToString(createSSRApp(NewsPostView))
}

describe('news', () => {
  it('lists every post with its date and a lazy card image', async () => {
    const markup = await renderToString(createSSRApp(NewsView))

    expect(markup).toContain('Aruna V3 is open for public testing')
    expect(markup).toContain('<time datetime="2026-10-20">20 Oct 2026</time>')
    expect(markup).toContain('src="/blog/aruna-v2-to-v3-800.webp"')
    expect(markup).toContain('loading="lazy"')
    expect(markup.match(/<li/g)).toHaveLength(newsPosts.length)
  })

  it('renders a post with its header image, table and links', async () => {
    const markup = await renderSlug('aruna-v3-public-testing')

    expect(markup).toContain('<h1')
    expect(markup).toContain('width="1400" height="875"')
    expect(markup).toContain('<h2>Aruna V2 and Aruna V3 at a glance</h2>')
    expect(markup).toContain('<table>')
    expect(markup).toContain('<strong>Aruna V3</strong>')
    expect(markup).toContain('href="https://github.com/arunaengine/aruna"')
    expect(markup).not.toContain('Post not found')
  })

  it('shows a not found state for an unknown slug', async () => {
    const markup = await renderSlug('no-such-post')

    expect(markup).toContain('Post not found')
    expect(markup).not.toContain('<article')
  })

  it('escapes raw HTML in post text', () => {
    const post = { ...newsPosts[0], body: '<script>alert(1)</script> [x](javascript:alert(1))' } as NewsPost

    const html = renderPost(post)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })
})
