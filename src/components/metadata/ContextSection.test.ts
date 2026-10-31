import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ContextSection from './ContextSection.vue'

describe('context section', () => {
  it('renders its default heading icon', async () => {
    const comments = [{ id: 'c1', text: 'Checked the counts.' }]
    const html = await renderToString(createSSRApp(ContextSection, { entities: [], comments }))
    expect(html).toContain('lucide-shapes')
    expect(html).toContain('Checked the counts.')
  })
})
