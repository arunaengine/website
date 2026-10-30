import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { Server } from '@lucide/vue'
import SectionHeading from './SectionHeading.vue'

describe('section heading', () => {
  it('names the section with its icon, an info button and its actions at the right', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(SectionHeading, { title: 'Realm', icon: Server, info: 'The nodes of this realm.' }, { actions: () => h('a', { href: '/status' }, 'Status') }),
    }))
    expect(html).toMatch(/<h2[^>]*class="type-section-title[^"]*"[^>]*>Realm<\/h2>/)
    expect(html).toContain('lucide-server')
    expect(html).toContain('aria-label="About Realm"')
    expect(html).toContain('href="/status"')
  })

  it('leaves the info button and the action row out when not given', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(SectionHeading, { title: 'Groups', level: 3 }) }))
    expect(html).toContain('<h3')
    expect(html).not.toContain('About Groups')
    expect(html).not.toContain('flex-wrap items-center gap-2')
  })

  it('shows a count after the title', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(SectionHeading, { title: 'Buckets', count: '5' }) }))
    expect(html).toMatch(/>Buckets<\/h2><span[^>]*tabular-nums[^>]*>5<\/span>/)
  })
})
