import { describe, expect, it } from 'vitest'
import { validateCrate } from './validate'

function crateWithContext(context: string) {
  return {
    '@context': context,
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': context.replace(/\/context$/, '') },
        about: { '@id': './' },
      },
      { '@id': './', '@type': 'Dataset', name: 'Validation fixture' },
    ],
  }
}

describe('RO-Crate context handling', () => {
  it('runs deep validation with the bundled RO-Crate 1.3 context and mappings', async () => {
    const fixture = {
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
          input: { '@id': '#parameter' },
        },
        { '@id': '#parameter', '@type': 'FormalParameter' },
      ],
    }
    const shapes = `
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix schema: <http://schema.org/> .
      @prefix bioschemas: <https://bioschemas.org/terms/> .
      <#RootShape> a sh:NodeShape ;
        sh:property [ sh:path bioschemas:input ; sh:minCount 1 ] ;
        sh:property [
          sh:path schema:datePublished ;
          sh:minCount 1 ;
          sh:message "RO-Crate 1.3 validation ran."
        ] .
    `

    const findings = await validateCrate(fixture, [shapes], 'urn:fixture:aruna:rocrate:1.3')

    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'RO-Crate 1.3 validation ran.',
      }),
    ])
  })

  it.each([
    'http://w3id.org/ro/crate/1.3/context',
    'https://www.researchobject.org/ro-crate/1.3/context.jsonld',
  ])('whitelists the RO-Crate 1.3 context alias %s', async (context) => {
    expect(await validateCrate(crateWithContext(context), [], './')).toEqual([])
  })

  it('keeps the generic skip message for an unknown remote context', async () => {
    const context = 'https://example.test/context.jsonld'
    const findings = await validateCrate(crateWithContext(context), [], './')

    expect(findings[0]?.message).toBe(
      `Deep validation skipped: the crate uses a remote context that is not bundled (${context}). Only the RO-Crate 1.2 and 1.3 contexts are available offline.`,
    )
  })

  it('continues to validate RO-Crate 1.2 with the bundled context', async () => {
    const findings = await validateCrate(
      crateWithContext('https://w3id.org/ro/crate/1.2/context'),
      [],
      './',
    )

    expect(findings).toEqual([])
  })
})
