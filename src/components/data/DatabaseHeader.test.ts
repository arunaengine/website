import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'

const entry = { title: 'RefSeq genomes', datasetId: null, public: true, metadata: { license: 'https://www.ncbi.nlm.nih.gov/home/about/policies/', description: '' } }
vi.mock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) }))
vi.mock('@/composables/useDatabases', () => ({ useDatabases: () => ({ ensure: vi.fn(), find: () => entry }) }))

const DatabaseHeader = (await import('./DatabaseHeader.vue')).default

describe('database header', () => {
  it('links a license given as a link instead of printing the address', async () => {
    const html = await renderToString(createSSRApp(DatabaseHeader, { bucket: 'ncbi', nodeId: null }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('License: open the license')
    expect(text).toContain('Public')
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov/home/about/policies/"')
    expect(text).not.toContain('·')
  })
})
