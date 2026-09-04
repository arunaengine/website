import { describe, expect, it } from 'vitest'
import { MAX_PREVIEW_HTML, safeHtmlDocument } from './htmlDocument'

describe('safeHtmlDocument', () => {
  it('drops every script and inline handler', () => {
    const result = safeHtmlDocument(
      '<p onclick="steal()">hi</p><script>fetch("https://evil.test")</script><img src="data:image/png;base64,AA">',
    )

    expect(result.html).not.toContain('script')
    expect(result.html).not.toContain('onclick')
    expect(result.html).toContain('data:image/png;base64,AA')
    expect(result.removed).toBe(2)
  })

  it('keeps inline images and drops every outward reference', () => {
    const result = safeHtmlDocument(
      '<img src="https://tracker.test/pixel.gif"><img src="data:image/png;base64,BB" alt="Per base quality">'
      + '<a href="https://elsewhere.test">out</a><a href="#M1">in</a>'
      + '<link rel="stylesheet" href="https://cdn.test/x.css"><iframe src="https://evil.test"></iframe>',
    )

    expect(result.html).not.toContain('tracker.test')
    expect(result.html).not.toContain('elsewhere.test')
    expect(result.html).not.toContain('cdn.test')
    expect(result.html).not.toContain('evil.test')
    expect(result.html).toContain('data:image/png;base64,BB')
    expect(result.html).toContain('alt="Per base quality"')
    expect(result.html).toContain('href="#M1"')
  })

  it('cuts remote urls out of style rules and declares the policy', () => {
    const result = safeHtmlDocument(
      '<style>@import url(https://cdn.test/a.css); body { background: url(https://cdn.test/b.png) }</style>'
      + '<div style="background: url(\'https://cdn.test/c.png\')">x</div>',
    )

    expect(result.html).not.toContain('cdn.test')
    expect(result.html).toContain("default-src 'none'; img-src data:")
  })

  it('cuts a file too large to render and says so', () => {
    const result = safeHtmlDocument(`<p>${'a'.repeat(MAX_PREVIEW_HTML)}</p>`)

    expect(result.truncated).toBe(true)
    expect(result.html.length).toBeLessThan(MAX_PREVIEW_HTML + 500)
  })
})
