import { readFileSync } from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import QuotaBar from './QuotaBar.vue'
import QuotaLegend from './QuotaLegend.vue'

const theme = readFileSync(new URL('../../assets/main.css', import.meta.url), 'utf8')

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

  it('draws stored and referenced in the theme colors with a gap between them', async () => {
    const markup = await render({ used: 3, quota: 10, referenced: 4 } as never)

    expect(markup).toContain('background-color:var(--quota-stored)')
    expect(markup).toContain('left:calc(30% + 2px)')
    expect(markup).toContain('background-color:var(--quota-referenced)')
    const legend = await renderToString(createSSRApp({ render: () => h(QuotaLegend) }))
    expect(legend).toContain('background-color:var(--quota-referenced)')
  })

  it('defines both colors for the light and the dark theme', () => {
    const light = theme.slice(theme.indexOf(':root'), theme.indexOf('.dark'))
    const dark = theme.slice(theme.indexOf('.dark'))
    expect([light, dark].map((block) => block.match(/--quota-(stored|referenced): (#[0-9a-f]{6})/g))).toEqual([
      ['--quota-stored: #3a62c8', '--quota-referenced: #a9d6c3'],
      ['--quota-stored: #6286e0', '--quota-referenced: #3b6f5e'],
    ])
  })
})
