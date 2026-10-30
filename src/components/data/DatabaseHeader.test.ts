import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'

const entry = { title: 'RefSeq genomes', datasetId: null, public: true, metadata: { license: 'https://www.ncbi.nlm.nih.gov/home/about/policies/', description: '', version: '229' } }
let found: typeof entry | undefined = entry
vi.mock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) }))
vi.mock('@/composables/useDatabases', () => ({ useDatabases: () => ({ ensure: vi.fn(), find: () => found }) }))

const DatabaseHeader = (await import('./DatabaseHeader.vue')).default

describe('database header', () => {
  it('links a license given as a link instead of printing the address', async () => {
    const html = await renderToString(createSSRApp(DatabaseHeader, { bucket: 'ncbi', nodeId: null }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('RefSeq genomes, release 229')
    expect(html).toContain('aria-label="Open the license"')
    expect(text).toContain('Public')
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov/home/about/policies/"')
    expect(text).not.toContain('·')
  })

  it('heads a synced bucket with its partners and any other bucket with its name', async () => {
    found = undefined
    try {
      const synced = await renderToString(createSSRApp(DatabaseHeader, { bucket: 'laptop', nodeId: null, syncedWith: [{ id: 'n2', name: 'Microbiology laptop' }] }))
      expect(synced.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toContain('Synced with Microbiology laptop')
      const plain = await renderToString(createSSRApp(DatabaseHeader, { bucket: 'indexes', nodeId: null }))
      expect(plain.replace(/<[^>]+>/g, ' ')).toContain('indexes')
      expect(plain).not.toContain('Open the license')
    } finally {
      found = entry
    }
  })
})
