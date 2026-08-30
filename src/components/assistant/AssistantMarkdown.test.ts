import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import AssistantMarkdown from './AssistantMarkdown.vue'

async function render(text: string): Promise<string> {
  return renderToString(createSSRApp({
    render: () => h(AssistantMarkdown, { text, size: 'full' }),
  }))
}

describe('AssistantMarkdown', () => {
  it('renders readable Markdown with safe external links', async () => {
    const markup = await render('# Heading\n\n**bold** and [docs](https://example.test)\n\n- one\n- two\n\n```ts\nconst value = 1\n```')

    expect(markup).toContain('<h1>Heading</h1>')
    expect(markup).toContain('<strong>bold</strong>')
    expect(markup).toContain('<ul>')
    expect(markup).toContain('<pre><code class="language-ts">')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup).toContain('class="assistant-markdown')
  })

  it('gives every fenced block a copy control', async () => {
    const markup = await render('```sh\nls -la\n```')

    expect(markup).toContain('class="assistant-code"')
    expect(markup).toContain('<button type="button" data-copy class="assistant-copy">Copy</button>')
  })

  it('escapes raw HTML and rejects unsafe link protocols', async () => {
    const markup = await render('<script>alert(1)</script>\n\n[bad](javascript:alert(1))')

    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(markup).not.toContain('<script>')
    expect(markup).not.toContain('href="javascript:')
  })
})
