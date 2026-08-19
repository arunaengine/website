import { describe, expect, it } from 'vitest'
import { classifyRoCrateSpecIri, RO_CRATE_SPEC_IRIS } from './rocrateVersions'

describe('RO-Crate specification IRI classification', () => {
  it.each([
    ['https://w3id.org/ro/crate/1.1', '1.1'],
    ['http://w3id.org/ro/crate/1.1/context', '1.1'],
    ['https://w3id.org/ro/crate/1.2', '1.2'],
    ['http://w3id.org/ro/crate/1.2/context', '1.2'],
    ['https://www.researchobject.org/ro-crate/1.2/context.jsonld', '1.2'],
  ])('classifies %s as supported RO-Crate %s', (iri, version) => {
    expect(RO_CRATE_SPEC_IRIS.has(iri)).toBe(true)
    expect(classifyRoCrateSpecIri(iri)).toEqual({ kind: 'supported', version })
  })

  it.each([
    'https://w3id.org/ro/crate/1.3',
    'http://w3id.org/ro/crate/1.3',
    'https://w3id.org/ro/crate/1.3/context',
    'http://w3id.org/ro/crate/1.3/context',
    'https://www.researchobject.org/ro-crate/1.3/context.jsonld',
  ])('classifies %s as known but unsupported', (iri) => {
    expect(RO_CRATE_SPEC_IRIS.has(iri)).toBe(true)
    expect(classifyRoCrateSpecIri(iri)).toEqual({ kind: 'known-unsupported', version: '1.3' })
  })

  it('leaves non-specification IRIs available as profiles', () => {
    const iri = 'https://example.test/profiles/genomics/1.3'
    expect(RO_CRATE_SPEC_IRIS.has(iri)).toBe(false)
    expect(classifyRoCrateSpecIri(iri)).toEqual({ kind: 'non-spec' })
  })
})
