import { describe, expect, it } from 'vitest'

import { resolveLicenseRows } from './jsonldLicense'

function crate(
  license: unknown,
  context: unknown = 'https://w3id.org/ro/crate/1.2/context',
): { '@context': unknown; '@graph': Array<Record<string, unknown>> } {
  return {
    '@context': context,
    '@graph': [
      { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
      { '@id': './', license },
    ],
  }
}

describe('resolveLicenseRows', () => {
  it('links bare URL literals', () => {
    expect(resolveLicenseRows(crate('https://spdx.org/licenses/MIT.html'))).toEqual([
      {
        kind: 'Literal',
        label: 'https://spdx.org/licenses/MIT.html',
        href: 'https://spdx.org/licenses/MIT.html',
      },
    ])
  })

  it('keeps ordinary and unsafe literals unlinked', () => {
    expect(resolveLicenseRows(crate(['MIT', 'javascript:alert(1)']))).toEqual([
      { kind: 'Literal', label: 'MIT' },
      { kind: 'Literal', label: 'javascript:alert(1)' },
    ])
  })

  it('distinguishes external and internal references', () => {
    const context = {
      license: { '@id': 'http://schema.org/license', '@type': '@id' },
    }
    expect(resolveLicenseRows(crate('https://spdx.org/licenses/Apache-2.0.html', context))).toEqual([
      {
        kind: 'External IRI',
        label: 'https://spdx.org/licenses/Apache-2.0.html',
        href: 'https://spdx.org/licenses/Apache-2.0.html',
      },
    ])

    const internal = crate('#license', context)
    internal['@graph'].push({ '@id': '#license', name: 'Local license' })
    expect(resolveLicenseRows(internal)).toEqual([
      { kind: 'Internal reference', label: 'Local license' },
    ])
  })

  it('applies bundled contexts inside arrays', () => {
    const context = [
      'https://w3id.org/ro/crate/1.1/context',
      { alias: 'http://schema.org/license' },
    ]
    const value = crate(undefined, context)
    value['@graph'][1] = { '@id': './', alias: 'CC-BY-4.0' }
    expect(resolveLicenseRows(value)).toEqual([
      { kind: 'Literal', label: 'CC-BY-4.0' },
    ])
  })

  it('uses a clickable fallback license', () => {
    expect(resolveLicenseRows({ '@graph': [] }, 'https://example.test/license')).toEqual([
      {
        kind: 'Literal',
        label: 'https://example.test/license',
        href: 'https://example.test/license',
      },
    ])
  })
})
