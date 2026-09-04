import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import AssistantMarkdown from './AssistantMarkdown.vue'

async function render(text: string, hasCard = false): Promise<string> {
  return renderToString(createSSRApp({
    render: () => h(AssistantMarkdown, { text, size: 'full', hasCard }),
  }))
}

const LONG = `Here is what the numbers say. ${'The run finished and wrote its results. '.repeat(12)}`

describe('AssistantMarkdown', () => {
  it('renders readable Markdown with safe external links', async () => {
    const markup = await render('# Heading\n\n**bold** and [docs](https://example.test)\n\n- one\n- two\n\n```ts\nconst value = 1\n```')

    expect(markup).toContain('<h1>Heading</h1>')
    expect(markup).toContain('<strong>bold</strong>')
    expect(markup).toContain('<ul>')
    expect(markup).toContain('<pre><code class="language-ts">')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup).toContain('assistant-markdown')
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

  it('folds long prose that repeats a card and leaves short prose open', async () => {
    const folded = await render(LONG, true)
    const short = await render('The run succeeded.', true)
    const noCard = await render(LONG)

    expect(folded).toContain('assistant-fold')
    expect(folded).toContain('Show more</button>')
    expect(short).not.toContain('assistant-fold')
    expect(short).not.toContain('Show more')
    expect(noCard).not.toContain('assistant-fold')
    expect(noCard).not.toContain('Show more')
  })

  it('links a stored object path but never one inside a code fence', async () => {
    const prose = await render('The full JSON result is at s3://lorem/results/gc_analysis_rerun.json.')
    const fenced = await render('```sh\ncat lorem/results/gc_analysis_rerun.json\n```')

    expect(prose).toContain('href="/app/buckets/lorem?prefix=results&amp;object=results%2Fgc_analysis_rerun.json"')
    expect(prose).toContain('data-object="results/gc_analysis_rerun.json"')
    expect(prose).not.toContain('target="_blank"')
    expect(fenced).not.toContain('/app/buckets/')
  })
})
