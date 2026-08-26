import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import RefusalNote from './RefusalNote.vue'

function render(message: string, tone?: 'error' | 'warning'): Promise<string> {
  return renderToString(createSSRApp({ render: () => h(RefusalNote, { message, tone }) }))
}

describe('refusal note', () => {
  it('lists the lines after the first', async () => {
    const markup = await render('Refused.\nFirst reason.\n\nSecond reason.\n')
    expect(markup).toContain('font-medium')
    expect(markup.match(/<li>/g)).toHaveLength(2)
    expect(markup).toContain('Second reason.')
  })

  it('keeps one line plain', async () => {
    const markup = await render('Your session expired.')
    expect(markup).not.toContain('<ul')
    expect(markup).not.toContain('font-medium')
  })

  it('tints a warning amber', async () => {
    expect(await render('Still waiting.', 'warning')).toContain('amber')
  })
})
