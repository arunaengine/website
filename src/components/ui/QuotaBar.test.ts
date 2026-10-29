import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import QuotaBar from './QuotaBar.vue'

const render = (props: { used: number; quota: number | null }) =>
  renderToString(createSSRApp({ render: () => h(QuotaBar, { showLabels: false, legend: false, ...props }) }))

describe('quota bar', () => {
  it('fills stored bytes without a quota or referenced bytes', async () => {
    const markup = await render({ used: 2048, quota: null })
    expect(markup).toContain('width:100%')
    expect(markup).not.toContain('opacity-60')
  })

  it('keeps an empty bar without a quota dimmed', async () => {
    const markup = await render({ used: 0, quota: null })
    expect(markup).not.toContain('width:')
    expect(markup).toContain('opacity-60')
  })
})
