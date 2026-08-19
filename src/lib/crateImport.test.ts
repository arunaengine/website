import { describe, expect, it } from 'vitest'
import { analyzeCrateJson } from './crateImport'

describe('analyzeCrateJson', () => {
  it('counts nested leaf files without counting Dataset directories', () => {
    const crate = {
      '@context': 'https://w3id.org/ro/crate/1.2/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
        {
          '@id': './',
          '@type': 'Dataset',
          name: 'Nested crate',
          hasPart: [{ '@id': 'data/' }, { '@id': 'README.txt' }],
        },
        {
          '@id': 'data/',
          '@type': 'Dataset',
          hasPart: [{ '@id': 'data/images/' }, { '@id': 'data/image.png' }],
        },
        {
          '@id': 'data/images/',
          '@type': 'https://schema.org/Dataset',
          hasPart: [{ '@id': 'data/images/audio.ogg' }],
        },
        { '@id': 'README.txt', '@type': 'File' },
        { '@id': 'data/image.png', '@type': 'https://schema.org/ImageObject' },
        { '@id': 'data/images/audio.ogg', '@type': 'AudioObject' },
      ],
    }

    expect(analyzeCrateJson(JSON.stringify(crate), 'nested.json').fileCount).toBe(3)
  })
})
