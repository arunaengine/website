import { describe, expect, it } from 'vitest'
import { licenseLabelOf, wellKnownLicense } from './licenses'

describe('wellKnownLicense', () => {
  it('maps cc licenses', () => {
    expect(wellKnownLicense('https://creativecommons.org/licenses/by/4.0/')).toBe('CC BY 4.0')
    expect(wellKnownLicense('https://creativecommons.org/licenses/by-sa/4.0')).toBe('CC BY-SA 4.0')
    expect(wellKnownLicense('http://creativecommons.org/licenses/by-nc-nd/3.0/')).toBe('CC BY-NC-ND 3.0')
  })

  it('maps public domain', () => {
    expect(wellKnownLicense('https://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0 1.0')
    expect(wellKnownLicense('https://creativecommons.org/publicdomain/mark/1.0/')).toBe('Public Domain Mark 1.0')
  })

  it('maps spdx ids', () => {
    expect(wellKnownLicense('https://spdx.org/licenses/MIT')).toBe('MIT')
    expect(wellKnownLicense('https://spdx.org/licenses/Apache-2.0.html')).toBe('Apache-2.0')
    expect(wellKnownLicense('https://spdx.org/licenses/GPL-3.0-or-later/')).toBe('GPL-3.0-or-later')
  })

  it('rejects unknown iris', () => {
    expect(wellKnownLicense('https://example.org/licenses/custom')).toBeUndefined()
    expect(wellKnownLicense('https://creativecommons.org/licenses/unknown/9.9')).toBeUndefined()
  })
})

describe('licenseLabelOf', () => {
  it('prefers entity name', () => {
    expect(licenseLabelOf('https://creativecommons.org/licenses/by/4.0/', 'Creative Commons Attribution 4.0 International')).toBe(
      'Creative Commons Attribution 4.0 International',
    )
  })

  it('skips echoed iri', () => {
    // licenseEntity falls back to the URL as its own name; that is not a label.
    expect(licenseLabelOf('https://creativecommons.org/licenses/by/4.0/', 'https://creativecommons.org/licenses/by/4.0/')).toBe(
      'CC BY 4.0',
    )
  })

  it('falls back readable', () => {
    expect(licenseLabelOf('https://example.org/terms/internal-license/')).toBe('internal-license')
    expect(licenseLabelOf('urn:example:license:closed')).toBe('urn:example:license:closed')
  })
})
