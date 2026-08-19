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
  it('explains that RO-Crate 1.3 is known but not supported yet', async () => {
    const findings = await validateCrate(
      crateWithContext('https://w3id.org/ro/crate/1.3/context'),
      [],
      './',
    )

    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'info',
        message: 'Deep validation skipped: RO-Crate 1.3 is not supported yet. Validation remains at RO-Crate 1.2, and full 1.3 support will arrive with a later release.',
      }),
    ])
  })

  it('keeps the generic skip message for an unknown remote context', async () => {
    const context = 'https://example.test/context.jsonld'
    const findings = await validateCrate(crateWithContext(context), [], './')

    expect(findings[0]?.message).toBe(
      `Deep validation skipped: the crate uses a remote context that is not bundled (${context}). Only the RO-Crate 1.2 context is available offline.`,
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
