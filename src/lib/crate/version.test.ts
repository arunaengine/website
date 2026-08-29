import { describe, expect, it } from 'vitest'
import { contextVersion, normalizeContext } from './version'
import { fromRoCrate, newDraft, toRoCrate } from './editor'

describe('crate version', () => {
  it('reads the version out of a context', () => {
    expect(contextVersion('https://w3id.org/ro/crate/1.3/context')).toBe('1.3')
    expect(contextVersion(['https://w3id.org/ro/crate/1.2/context', { ex: 'http://example.org/' }])).toBe('1.2')
    expect(contextVersion({ ex: 'http://example.org/' })).toBe('1.2')
  })

  it('upgrades a 1.1 context to 1.2', () => {
    // The node accepts only 1.2 and 1.3, so a 1.1 crate is written as 1.2.
    expect(normalizeContext('https://w3id.org/ro/crate/1.1/context')).toBe('https://w3id.org/ro/crate/1.2/context')
    expect(normalizeContext(['http://w3id.org/ro/crate/1.1/context', { ex: 'x' }]))
      .toEqual(['https://w3id.org/ro/crate/1.2/context', { ex: 'x' }])
    expect(contextVersion('https://w3id.org/ro/crate/1.1/context')).toBe('1.2')
  })

  it('declares one version in the context and the descriptor', () => {
    const crate = toRoCrate(newDraft())
    const descriptor = (crate['@graph'] as Array<Record<string, unknown>>)[0]

    expect(crate['@context']).toBe('https://w3id.org/ro/crate/1.2/context')
    expect(descriptor.conformsTo).toEqual({ '@id': 'https://w3id.org/ro/crate/1.2' })
  })

  it('keeps an imported 1.3 crate on 1.3', () => {
    const imported = fromRoCrate({
      '@context': 'https://w3id.org/ro/crate/1.3/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', conformsTo: { '@id': 'https://w3id.org/ro/crate/1.3' }, about: { '@id': './' } },
        { '@id': './', '@type': 'Dataset', name: 'Kept' },
      ],
    })
    const crate = toRoCrate(imported)
    const descriptor = (crate['@graph'] as Array<Record<string, unknown>>)[0]

    expect(crate['@context']).toBe('https://w3id.org/ro/crate/1.3/context')
    expect(descriptor.conformsTo).toEqual({ '@id': 'https://w3id.org/ro/crate/1.3' })
  })

  it('rewrites an imported 1.1 crate to 1.2 on the way out', () => {
    const imported = fromRoCrate({
      '@context': 'https://w3id.org/ro/crate/1.1/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', conformsTo: { '@id': 'https://w3id.org/ro/crate/1.1' }, about: { '@id': './' } },
        { '@id': './', '@type': 'Dataset', name: 'Old' },
      ],
    })
    const crate = toRoCrate(imported)
    const descriptor = (crate['@graph'] as Array<Record<string, unknown>>)[0]

    expect(crate['@context']).toBe('https://w3id.org/ro/crate/1.2/context')
    expect(descriptor.conformsTo).toEqual({ '@id': 'https://w3id.org/ro/crate/1.2' })
  })
})
