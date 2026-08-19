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

  it('imports a RO-Crate 1.3 fixture with its version and file count', () => {
    const crate = {
      '@context': 'https://w3id.org/ro/crate/1.3/context',
      '@graph': [
        {
          '@id': 'ro-crate-metadata.json',
          '@type': 'CreativeWork',
          conformsTo: { '@id': 'https://w3id.org/ro/crate/1.3' },
          about: { '@id': 'urn:fixture:aruna:rocrate:1.3' },
        },
        {
          '@id': 'urn:fixture:aruna:rocrate:1.3',
          '@type': ['Dataset', 'ComputationalWorkflow'],
          name: 'RO-Crate 1.3 round-trip fixture',
          conformsTo: [
            { '@id': 'https://w3id.org/ro/crate/1.3' },
            { '@id': 'https://example.test/profiles/future' },
          ],
          input: { '@id': '#parameter' },
          output: { '@id': '#parameter' },
          hasPart: { '@id': 'results.tsv' },
        },
        { '@id': '#parameter', '@type': 'FormalParameter' },
        { '@id': 'results.tsv', '@type': 'File', name: 'Results' },
      ],
    }

    const preview = analyzeCrateJson(JSON.stringify(crate), 'roundtrip-1.3.json')

    expect(preview.crate).toEqual(crate)
    expect(preview.specVersion).toBe('1.3')
    expect(preview.unknownSpecVersion).toBeUndefined()
    expect(preview.fileCount).toBe(1)
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

    expect(preview.specVersion).toBe('1.2')
    expect(preview.unknownSpecVersion).toBeUndefined()
    expect(preview.conformsToIds).toEqual(['https://example.test/profiles/current'])
  })

  it('records an unknown specification version without treating it as a profile', () => {
    const crate = {
      '@context': 'https://w3id.org/ro/crate/1.4/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
        {
          '@id': './',
          '@type': 'Dataset',
          conformsTo: [
            { '@id': 'https://w3id.org/ro/crate/1.4' },
            { '@id': 'https://example.test/profiles/future' },
          ],
        },
      ],
    }

    const preview = analyzeCrateJson(JSON.stringify(crate), 'unknown.json')

    expect(preview.specVersion).toBeUndefined()
    expect(preview.unknownSpecVersion).toBe('1.4')
    expect(preview.conformsToIds).toEqual(['https://example.test/profiles/future'])
  })
})
