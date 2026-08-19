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

  it('classifies RO-Crate 1.3 as unsupported instead of an unknown profile', () => {
    const crate = {
      '@context': 'https://w3id.org/ro/crate/1.3/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
        {
          '@id': './',
          '@type': 'Dataset',
          name: 'Future crate',
          conformsTo: [
            { '@id': 'https://w3id.org/ro/crate/1.3' },
            { '@id': 'https://example.test/profiles/future' },
          ],
        },
      ],
    }

    const preview = analyzeCrateJson(JSON.stringify(crate), 'future.json')

    expect(preview.unsupportedSpecVersion).toBe('1.3')
    expect(preview.conformsToIds).toEqual(['https://example.test/profiles/future'])
  })

  it('keeps RO-Crate 1.2 supported and out of the profile list', () => {
    const crate = {
      '@context': 'https://w3id.org/ro/crate/1.2/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
        {
          '@id': './',
          '@type': 'Dataset',
          conformsTo: [
            { '@id': 'http://w3id.org/ro/crate/1.2' },
            { '@id': 'https://example.test/profiles/current' },
          ],
        },
      ],
    }

    const preview = analyzeCrateJson(JSON.stringify(crate), 'current.json')

    expect(preview.unsupportedSpecVersion).toBeUndefined()
    expect(preview.conformsToIds).toEqual(['https://example.test/profiles/current'])
  })
})
