import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import DetailList from './DetailList.vue'

describe('detail list', () => {
  it('puts a sentence-case label above each value, without a box, and mono only where asked', async () => {
    const html = (await renderToString(createSSRApp({
      render: () => h(DetailList, { items: [{ label: 'Bucket', value: 'laptop' }, { label: 'Version', value: '01JABCDEF', mono: true }] }),
    }))).replace(/<!--[^>]*-->/g, '')
    expect(html).not.toContain('uppercase')
    expect(html).not.toContain('surface-inline')
    expect(html).toMatch(/<dt class="type-label">Bucket<\/dt><dd class="[^"]*break-words[^"]*">laptop<\/dd>/)
    expect(html).toMatch(/<dd class="[^"]*font-mono[^"]*">01JABCDEF<\/dd>/)
    expect(html.match(/font-mono/g)).toHaveLength(1)
  })
})
