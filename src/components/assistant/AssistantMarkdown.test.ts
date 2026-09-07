import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import AssistantMarkdown from './AssistantMarkdown.vue'

async function render(
  text: string,
  hasCard = false,
  sources?: Array<{ url: string; title?: string }>,
): Promise<string> {
  return renderToString(createSSRApp({
    render: () => h(AssistantMarkdown, { text, size: 'full', hasCard, sources }),
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

  it('resolves image attachments without accepting unsafe replacements', async () => {
    const markup = await renderToString(createSSRApp({ render: () => h(AssistantMarkdown, {
      text: '![plot](attachment:plot.png) ![bad](attachment:bad.png)',
      imageSources: { 'attachment:plot.png': 'data:image/png;base64,iVBORw0KGgo=', 'attachment:bad.png': 'javascript:alert(1)' },
    }) }))
    expect(markup).toContain('src="data:image/png;base64,iVBORw0KGgo="')
    expect(markup).not.toContain('src="javascript:')
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

  it('gives a page cited twice one number and one reference', async () => {
    const markup = await render(
      'Water boils at 100 C ([example.test](https://example.test/water)). '
      + 'It freezes at 0 C ([example.test](https://example.test/water/#top)).',
    )

    expect(markup.match(/data-cite>\[1\]</g)).toHaveLength(2)
    expect(markup).not.toContain('[2]')
    // The parentheses around the dropped domain go with it.
    expect(markup).toContain('Water boils at 100 C <sup')
    expect(markup).not.toContain('(<sup')
    expect(markup).toContain('</sup>. It freezes')
    expect(markup).toContain('References')
    expect(markup.match(/<li id="/g)).toHaveLength(1)
    expect(markup).toContain('[1] example.test</a>')
  })

  it('keeps real link text and puts the mark after it', async () => {
    const markup = await render('Read [the boiling point article](https://example.test/water) first.')

    expect(markup).toContain('the boiling point article<sup')
    expect(markup).toContain('data-cite>[1]</a></sup> first.')
    expect(markup).not.toContain('href="https://example.test/water">the boiling')
  })

  it('leaves links into the portal as they are', async () => {
    const markup = await render('See s3://lorem/results/gc_analysis_rerun.json and [the run](/app/compute/runs/1).')

    expect(markup).toContain('data-object="results/gc_analysis_rerun.json"')
    expect(markup).toContain('href="/app/compute/runs/1"')
    expect(markup).not.toContain('assistant-cite')
    expect(markup).not.toContain('assistant-references')
  })

  it('lists the references in order of first use with the page titles', async () => {
    const markup = await render(
      'One ([b.test](https://b.test/x)) two (https://a.test/) three ([b.test](https://b.test/x)).',
      false,
      [{ url: 'https://a.test', title: 'A site' }],
    )

    expect(markup.indexOf('[1] b.test')).toBeLessThan(markup.indexOf('[2] A site'))
    expect(markup).toContain('href="https://b.test/x" target="_blank" rel="noopener noreferrer">[1] b.test</a>')
    expect(markup).toContain('>[2] A site</a>')
    expect(markup).toContain('two <sup')
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
