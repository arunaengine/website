import { describe, expect, it } from 'vitest'
import { classifyRoCrateSpecIri, RO_CRATE_SPEC_IRIS } from './rocrateVersions'
import { RO_CRATE_CONTEXT, RO_CRATE_PROFILE } from './profiles/types'

describe('RO-Crate specification IRI classification', () => {
  it.each([
    ['https://w3id.org/ro/crate/1.1', '1.1'],
    ['http://w3id.org/ro/crate/1.1/context', '1.1'],
    ['https://w3id.org/ro/crate/1.2', '1.2'],
    ['http://w3id.org/ro/crate/1.2/context', '1.2'],
    ['https://www.researchobject.org/ro-crate/1.2/context.jsonld', '1.2'],
    ['https://w3id.org/ro/crate/1.3', '1.3'],
    ['http://w3id.org/ro/crate/1.3/context', '1.3'],
    ['https://www.researchobject.org/ro-crate/1.3/context.jsonld', '1.3'],
  ])('classifies %s as supported RO-Crate %s', (iri, version) => {
    expect(RO_CRATE_SPEC_IRIS.has(iri)).toBe(true)
    expect(classifyRoCrateSpecIri(iri)).toEqual({ kind: 'supported', version })
  })

  it('keeps known versions supported when a canonical context IRI has a trailing slash', () => {
    expect(classifyRoCrateSpecIri('https://w3id.org/ro/crate/1.3/context/')).toEqual({
      kind: 'supported',
      version: '1.3',
    })
  })

  it.each([
    'https://w3id.org/ro/crate/1.4',
    'http://w3id.org/ro/crate/1.4/context',
    'https://www.researchobject.org/ro-crate/1.4/context.jsonld',
  ])('classifies %s as an unknown RO-Crate specification version', (iri) => {
    expect(RO_CRATE_SPEC_IRIS.has(iri)).toBe(false)
    expect(classifyRoCrateSpecIri(iri)).toEqual({ kind: 'unknown-spec', version: '1.4' })
  })

  it('leaves non-specification IRIs available as profiles', () => {
    const iri = 'https://example.test/profiles/genomics/1.3'
    expect(RO_CRATE_SPEC_IRIS.has(iri)).toBe(false)
    expect(classifyRoCrateSpecIri(iri)).toEqual({ kind: 'non-spec' })
  })

  it('keeps portal-authored crate emission pinned to RO-Crate 1.2', () => {
    expect(RO_CRATE_PROFILE).toBe('https://w3id.org/ro/crate/1.2')
    expect(RO_CRATE_CONTEXT).toBe('https://w3id.org/ro/crate/1.2/context')
  })
})
