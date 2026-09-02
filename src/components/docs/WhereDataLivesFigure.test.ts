import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import WhereDataLivesFigure from './WhereDataLivesFigure.vue'

describe('where data lives figure', () => {
  it('paints no background and takes its colours from the theme', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(WhereDataLivesFigure) }))

    expect(html).toContain('role="img"')
    expect(html).toContain('<title>How an upload becomes copies</title>')
    expect(html).toContain('aria-label="An upload goes through a storage backend')
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/)
    expect(html).not.toContain('fill="#ffffff"')
    expect(html).toContain('fill="currentColor"')
    expect(html).toContain('text-foreground')
    expect(html).toContain('text-muted-foreground')
    expect(html).toContain('stroke-primary')
    expect(html).toContain('Placement policy')
    expect(html).toContain('Bucket B on another node')
  })
})
