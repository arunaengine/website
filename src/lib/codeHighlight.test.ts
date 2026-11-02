import { describe, expect, it } from 'vitest'
import { highlightHtml } from './codeHighlight'
import { blockLanguage } from './codeLanguage'

describe('blockLanguage', () => {
  it('maps the short names a code block carries', () => {
    expect(blockLanguage('py')).toBe('python')
    expect(blockLanguage('bash title="run"')).toBe('shell')
    expect(blockLanguage('JSON')).toBe('json')
    expect(blockLanguage('')).toBe('')
  })
})

describe('highlightHtml', () => {
  it('marks tokens with the editor style and escapes the code', async () => {
    const html = await highlightHtml('{"tag": "<b>", "n": 1}', 'json', false)

    expect(html).toContain('<span class=')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>')
  })

  it('keeps line breaks', async () => {
    expect(await highlightHtml('a = 1\nb = 2', 'python', true)).toContain('\n')
  })

  it('answers null for a language it does not know', async () => {
    expect(await highlightHtml('text', 'klingon', false)).toBeNull()
  })
})
