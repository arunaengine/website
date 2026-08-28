import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import Notice from './Notice.vue'

function render(props: Record<string, unknown>, body?: string): Promise<string> {
  return renderToString(
    createSSRApp({ render: () => h(Notice, props, body ? { default: () => body } : undefined) }),
  )
}

describe('notice', () => {
  it('announces an error and only a status otherwise', async () => {
    expect(await render({ tone: 'error' }, 'Refused.')).toContain('role="alert"')
    expect(await render({ tone: 'warning' }, 'Waiting.')).toContain('role="status"')
    expect(await render({}, 'Just so you know.')).toContain('role="status"')
  })

  it('lists the follow-up lines under the title', async () => {
    const markup = await render({ tone: 'warning', title: 'Two things', lines: ['One.', 'Two.'] })
    expect(markup).toContain('Two things')
    expect(markup.match(/<li>/g)).toHaveLength(2)
  })

  it('drops empty lines rather than rendering a stub list', async () => {
    expect(await render({ title: 'Alone', lines: [] })).not.toContain('<ul')
  })
})
