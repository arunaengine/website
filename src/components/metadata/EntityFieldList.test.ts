import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import EntityFieldList from './EntityFieldList.vue'

describe('entity field list', () => {
  it('shows the human label and keeps the raw property name in the tooltip', async () => {
    const fields = [{ id: 'http://schema.org/datePublished', key: 'datePublished', label: 'Date published', profiled: true, termUri: 'http://schema.org/datePublished', values: [{ text: '2026-10-28' }] }]
    const html = await renderToString(createSSRApp(EntityFieldList, { fields }))
    const text = html.replace(/<[^>]+>/g, ' ')

    expect(text).toContain('Date published')
    expect(text).not.toContain('datePublished')
    expect(html).toContain('title="http://schema.org/datePublished"')
  })
})
