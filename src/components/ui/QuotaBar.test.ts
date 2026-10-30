import { readFileSync } from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import QuotaBar from './QuotaBar.vue'

const theme = readFileSync(new URL('../../assets/main.css', import.meta.url), 'utf8')

const render = (props: { used: number; quota: number | null; referenced?: number; showLabels?: boolean; ceiling?: number; warn?: boolean }) =>
  renderToString(createSSRApp({ render: () => h(QuotaBar, { showLabels: false, ...props }) }))

describe('quota bar', () => {
  it('draws no bar without a quota, only the values', async () => {
    const markup = await render({ used: 2048, quota: null, referenced: 4096, showLabels: true })
    expect(markup).not.toContain('role="meter"')
    expect(markup).toContain('2\u00a0KB')
    expect(markup).toContain('stored, no quota')
    expect(markup).toContain('4\u00a0KB')
    expect(markup).toContain('referenced')
  })

  it('fills stored bytes against the quota and never draws referenced data', async () => {
    // Referenced data far beyond the quota must not shrink the quota part out of sight.
    const markup = await render({ used: 1, quota: 2, referenced: 10_000_000_000_000 })
    expect(markup).toContain('role="meter"')
    expect(markup).toContain('width:50%')
    expect(markup).toContain('background-color:var(--quota-stored)')
    expect(markup).not.toContain('quota-referenced')
  })

  it('keeps the warn and danger colors of the stored part', async () => {
    expect(await render({ used: 9, quota: 10, warn: true })).toContain('background-color:#335DC6')
    expect(await render({ used: 12, quota: 10, ceiling: 11 })).toContain('background-color:#DC2626')
  })

  it('defines the stored color for the light and the dark theme', () => {
    const light = theme.slice(theme.indexOf(':root'), theme.indexOf('.dark'))
    const dark = theme.slice(theme.indexOf('.dark'))
    expect([light, dark].map((block) => block.match(/--quota-(stored|referenced): (#[0-9a-f]{6})/g))).toEqual([
      ['--quota-stored: #3a62c8'],
      ['--quota-stored: #5b7fdb'],
    ])
  })
})
