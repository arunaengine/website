import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'

const entry = {
  title: 'RefSeq genomes', bucket: 'ncbi', datasetId: 'd1', public: true,
  description: {
    license: 'https://www.ncbi.nlm.nih.gov/home/about/policies/', description: 'RefSeq assemblies', version: '229',
    identifiers: [{ name: 'DOI', value: '10.1093/nar/gkv1189', url: 'https://doi.org/10.1093/nar/gkv1189' }],
  },
}
let found: typeof entry | undefined = entry
vi.mock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) }))
vi.mock('@/composables/useDatabases', () => ({ useDatabases: () => ({ ensure: vi.fn(), find: () => found }) }))

const DatabaseHeader = (await import('./DatabaseHeader.vue')).default

describe('database header', () => {
  it('shows the dataset: title, version, description, license and identifiers as links', async () => {
    const html = await renderToString(createSSRApp(DatabaseHeader, { bucket: 'ncbi', nodeId: null }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('RefSeq genomes, version 229')
    expect(text).toContain('RefSeq assemblies')
    // More shows only once the line is measured as cut off.
    expect(text).not.toContain('More')
    expect(html).toContain('aria-label="Open the license')
    expect(html).toContain('href="https://doi.org/10.1093/nar/gkv1189"')
    expect(text).toContain(' License ')
    expect(text).not.toContain(' https://www.ncbi.nlm.nih.gov/home/about/policies/ ')
    expect(text).toContain('Public')
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov/home/about/policies/"')
    expect(text).not.toContain('·')
  })

  it('links an SPDX license id to its license page', async () => {
    found = { ...entry, description: { ...entry.description, license: 'CC-BY-4.0' } }
    try {
      const html = await renderToString(createSSRApp(DatabaseHeader, { bucket: 'ncbi', nodeId: null }))
      expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"')
      expect(html.replace(/<[^>]+>/g, ' ')).toContain('CC BY 4.0')
    } finally {
      found = entry
    }
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
